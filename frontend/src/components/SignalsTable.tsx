import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { Signal } from "../types";
import {
  Deviation,
  Empty,
  ErrorNote,
  Loading,
  Meter,
  Panel,
  PanelHead,
  SelectableRow,
  Signed,
  Spec,
  Tag,
  Td,
  Th,
  fmtDate,
} from "./ui";

// Top mean-reversion signals: the one table on the screen that says what to do.
// Column groups run identity | direction | dislocation | trade, and the rules
// between them mark which figures are comparable with which.
export function SignalsTable({
  onSelectIssuer,
  selected,
}: {
  onSelectIssuer?: (i: string) => void;
  selected?: string | null;
}) {
  const { data, loading, error } = useApi<Signal[]>(() => api.topSignals(15), []);

  return (
    <Panel padded={false}>
      <div className="px-5 pt-5 md:px-6">
        <PanelHead
          title="Live signal book"
          note={
            data && data.length > 0
              ? `${data.length} rows · ${fmtDate(data[0].trade_date)}`
              : undefined
          }
        />
      </div>

      {loading && (
        <div className="px-5 pb-5 md:px-6">
          <Loading label="Scanning for dislocations" />
        </div>
      )}
      {error && (
        <div className="px-5 pb-5 md:px-6">
          <ErrorNote message={error} />
        </div>
      )}
      {data && data.length === 0 && (
        <div className="px-5 pb-5 md:px-6">
          <Empty>
            Nothing breaches ±2.00σ today. Loosen the entry threshold in the
            backtest to see what a wider rule would have picked up.
          </Empty>
        </div>
      )}

      {data && data.length > 0 && (
        <>
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse">
              <thead>
                <tr>
                  <Th>Cusip</Th>
                  <Th>Issuer</Th>
                  <Th>Rtg</Th>
                  <Th>Sector</Th>
                  <Th align="right">Mat</Th>
                  <Th group>Dir</Th>
                  <Th align="right" group>
                    Resid bp
                  </Th>
                  <Th>Z</Th>
                  <Th align="right" group>
                    Exp move bp
                  </Th>
                  <Th group>Conv</Th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <SelectableRow
                    key={s.cusip}
                    selected={selected === s.issuer}
                    onSelect={
                      onSelectIssuer ? () => onSelectIssuer(s.issuer) : undefined
                    }
                  >
                    <Td num align="left" className="text-muted">
                      {s.cusip}
                    </Td>
                    <Td className="font-medium">{s.issuer}</Td>
                    <Td>
                      <Tag>{s.rating}</Tag>
                    </Td>
                    <Td className="text-muted">{s.sector}</Td>
                    <Td num className="text-muted">
                      {fmtDate(s.maturity)}
                    </Td>
                    <Td group>
                      <Tag tone={s.direction === "BUY" ? "cheap" : "rich"}>
                        {s.direction === "BUY" ? "Buy cheap" : "Sell rich"}
                      </Tag>
                    </Td>
                    <Td num group>
                      <Signed value={s.residual} digits={1} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Deviation value={s.z_score} max={4} />
                        <Signed value={s.z_score} digits={2} />
                      </div>
                    </Td>
                    <Td num group>
                      {Math.abs(s.expected_reversion_bps).toFixed(1)}
                      <span className="ml-1.5 text-[10.5px] uppercase tracking-[0.06em] text-faint">
                        {s.expected_reversion_bps < 0 ? "tghtn" : "widen"}
                      </span>
                    </Td>
                    <Td group>
                      <div className="flex items-center gap-2.5">
                        <Meter value={s.signal_strength} />
                        <span className="font-mono text-[11.5px] text-muted">
                          {s.signal_strength}
                        </span>
                      </div>
                    </Td>
                  </SelectableRow>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 pb-5 md:px-6">
            <Spec
              items={[
                ["Entry", "|Z| ≥ 2.00σ"],
                ["Z window", "252D TRAILING"],
                ["Exp move", "−RESIDUAL, + = WIDENS"],
                ["Conv", "0.6·|Z| + 0.2·LIQ + 0.2·REV"],
                ["Z cap", "4.00σ"],
                ["Select row", "OPENS ISSUER CURVE"],
              ]}
            />
          </div>
        </>
      )}
    </Panel>
  );
}
