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
  PanelHeader,
  SelectableRow,
  Signed,
  Tag,
  Td,
  Th,
} from "./ui";

// Top mean-reversion signals: the one table on the page that says what to do.
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
      <div className="px-6 pt-6 md:px-8 md:pt-7">
        <PanelHeader
          title="Live signals"
          note="Select a row to load that issuer below"
        />
      </div>

      {loading && (
        <div className="px-6 pb-6 md:px-8">
          <Loading label="Scanning for dislocations" />
        </div>
      )}
      {error && (
        <div className="px-6 pb-6 md:px-8">
          <ErrorNote message={error} />
        </div>
      )}
      {data && data.length === 0 && (
        <div className="px-6 pb-6 md:px-8">
          <Empty>
            Nothing is more than two standard deviations off its curve right
            now. Widen the entry threshold in the backtest to see what a looser
            rule would have picked up.
          </Empty>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="scroll-slim overflow-x-auto pb-2">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <Th>Issuer</Th>
                <Th>Rating</Th>
                <Th>Action</Th>
                <Th>Off the curve</Th>
                <Th align="right">Spread should move</Th>
                <Th>Conviction</Th>
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
                  <Td>
                    <span className="font-medium">{s.issuer}</span>
                    <span className="ml-3 font-mono text-[12.5px] text-faint">
                      {s.cusip}
                    </span>
                  </Td>
                  <Td>
                    <Tag>{s.rating}</Tag>
                  </Td>
                  <Td>
                    <Tag tone={s.direction === "BUY" ? "cheap" : "rich"}>
                      {s.direction === "BUY" ? "Buy cheap" : "Sell rich"}
                    </Tag>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Deviation value={s.z_score} max={4} />
                      <Signed value={s.z_score} digits={2} />
                    </div>
                  </Td>
                  <Td align="right" className="num">
                    {Math.abs(s.expected_reversion_bps).toFixed(0)}
                    <span className="text-[0.85em] text-muted">
                      {" bp "}
                      {s.expected_reversion_bps < 0 ? "tighter" : "wider"}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Meter value={s.signal_strength} />
                      <span className="num text-[13px] text-muted">
                        {s.signal_strength}
                      </span>
                    </div>
                  </Td>
                </SelectableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
