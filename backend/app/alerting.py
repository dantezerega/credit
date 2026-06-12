"""Email / Slack alerting for fresh signals (bonus feature).

Both channels are optional and no-op cleanly when their config is absent, so
the rest of the system never depends on alerting being wired up. Slack uses an
incoming-webhook POST; email uses stdlib SMTP.
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

import httpx

from app.config import settings
from app.schemas import SignalEnriched

logger = logging.getLogger("alerting")


def _format_signals(signals: list[SignalEnriched]) -> str:
    """Render signals as a compact monospace table for alert bodies."""
    if not signals:
        return "No active signals."
    header = f"{'CUSIP':<10}{'ISSUER':<18}{'DIR':<5}{'Z':>7}{'STR':>5}"
    lines = [header, "-" * len(header)]
    for s in signals:
        lines.append(
            f"{s.cusip:<10}{s.issuer[:17]:<18}{s.direction:<5}"
            f"{s.z_score:>7.2f}{s.signal_strength:>5}"
        )
    return "\n".join(lines)


def send_slack_alert(signals: list[SignalEnriched]) -> bool:
    """Post a signal summary to Slack. Returns True if sent."""
    if not settings.slack_webhook_url:
        logger.debug("slack webhook not configured; skipping")
        return False
    text = f"*Credit RV — {len(signals)} active signal(s)*\n```{_format_signals(signals)}```"
    try:
        resp = httpx.post(settings.slack_webhook_url, json={"text": text}, timeout=10)
        resp.raise_for_status()
        return True
    except httpx.HTTPError as exc:  # pragma: no cover - network
        logger.error("slack alert failed: %s", exc)
        return False


def send_email_alert(signals: list[SignalEnriched]) -> bool:
    """Email a signal summary via SMTP. Returns True if sent."""
    if not (settings.smtp_host and settings.alert_email_to and settings.smtp_user):
        logger.debug("smtp not configured; skipping")
        return False
    msg = EmailMessage()
    msg["Subject"] = f"Credit RV — {len(signals)} active signal(s)"
    msg["From"] = settings.smtp_user
    msg["To"] = settings.alert_email_to
    msg.set_content(_format_signals(signals))
    try:  # pragma: no cover - network
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            if settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError) as exc:  # pragma: no cover - network
        logger.error("email alert failed: %s", exc)
        return False


def dispatch_alerts(signals: list[SignalEnriched]) -> dict[str, bool]:
    """Fan out to every configured channel; returns per-channel success."""
    return {
        "slack": send_slack_alert(signals),
        "email": send_email_alert(signals),
    }
