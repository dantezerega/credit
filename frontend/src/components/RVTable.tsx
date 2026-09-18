import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { RVRow } from "../types";
import {
  Deviation,
  Empty,
  ErrorNote,
  Loading,
  Panel,
  PanelHeader,
  SelectableRow,
  Signed,
  Tag,
  Td,
  Th,
  fmtDate,
} from "./ui";

interface Props {
  mode: "cheapest" | "richest";
  onSelectIssuer?: (issuer: string) => void;
  selected?: string | null;
}

// Top-20 rich/cheap ranking. Full width now, so every column gets room and the
// residual can carry a zero-anchored bar next to its number.
export function RVTable({ mode, onSelectIssuer, selected }: Props) {
  const { data, loading, error } = useApi<RVRow[]>(
    () => (mode === "cheapest" ? api.cheapest(20) : api.richest(20)),
    [mode],
  );

  const max = data
    ? Math.max(...data.map((r) => Math.abs(r.residual)), 1)
    : 1;

  return (
    <Panel padded={false}>
      <div className="px-6 pt-6 md:px-8 md:pt-7">
        <PanelHeader
          title={mode === "cheapest" ? "Twenty cheapest" : "Twenty richest"}
          note="Select a row to open that issuer's curve"
        />
      </div>

      {loading && (
        <div className="px-6 pb-6 md:px-8">
          <Loading label="Ranking bonds" />
        </div>
      )}
      {error && (
        <div className="px-6 pb-6 md:px-8">
          <ErrorNote message={error} />
        </div>
      )}
      {data && data.length === 0 && (
        <div className="px-6 pb-6 md:px-8">
          <Empty>No bonds ranked for this date.</Empty>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="scroll-slim overflow-x-auto pb-2">
          <table className="w-full min-w-[840px] border-collapse">
            <thead>
              <tr>
                <Th>CUSIP</Th>
                <Th>Issuer</Th>
                <Th>Rating</Th>
                <Th>Maturity</Th>
                <Th align="right">Spread</Th>
                <Th align="right">Model</Th>
                <Th>Off the curve</Th>
                <Th align="right">z</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <SelectableRow
                  key={r.cusip}
                  selected={selected === r.issuer}
                  onSelect={
                    onSelectIssuer ? () => onSelectIssuer(r.issuer) : undefined
                  }
                >
                  <Td className="font-mono text-[12.5px] text-muted">
                    {r.cusip}
                  </Td>
                  <Td className="font-medium">{r.issuer}</Td>
                  <Td>
                    <Tag>{r.rating}</Tag>
                  </Td>
                  <Td className="text-muted">{fmtDate(r.maturity)}</Td>
                  <Td align="right" className="num">
                    {r.current_spread.toFixed(0)}
                  </Td>
                  <Td align="right" className="num text-muted">
                    {r.model_spread.toFixed(0)}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Deviation value={r.residual} max={max} />
                      <Signed value={r.residual} unit=" bp" />
                    </div>
                  </Td>
                  <Td align="right">
                    <Signed value={r.z_score} digits={2} />
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
