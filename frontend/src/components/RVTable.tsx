import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import type { RVRow } from "../types";
import {
  Deviation,
  Empty,
  ErrorNote,
  Loading,
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

interface Props {
  mode: "cheapest" | "richest";
  onSelectIssuer?: (issuer: string) => void;
  selected?: string | null;
}

// Top-20 rich/cheap ranking. Observed spread and model spread sit next to each
// other so the subtraction is visible, and the residual carries the
// zero-anchored bar that scales to the widest row on screen.
export function RVTable({ mode, onSelectIssuer, selected }: Props) {
  const { data, loading, error } = useApi<RVRow[]>(
    () => (mode === "cheapest" ? api.cheapest(20) : api.richest(20)),
    [mode],
  );

  const max = data ? Math.max(...data.map((r) => Math.abs(r.residual)), 1) : 1;

  return (
    <Panel padded={false}>
      <div className="px-5 pt-5 md:px-6">
        <PanelHead
          title={mode === "cheapest" ? "Widest 20 residuals" : "Tightest 20 residuals"}
          note={data && data.length > 0 ? `${data.length} rows` : undefined}
        />
      </div>

      {loading && (
        <div className="px-5 pb-5 md:px-6">
          <Loading label="Ranking bonds" />
        </div>
      )}
      {error && (
        <div className="px-5 pb-5 md:px-6">
          <ErrorNote message={error} />
        </div>
      )}
      {data && data.length === 0 && (
        <div className="px-5 pb-5 md:px-6">
          <Empty>No bonds ranked for this date.</Empty>
        </div>
      )}

      {data && data.length > 0 && (
        <>
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr>
                  <Th>Cusip</Th>
                  <Th>Issuer</Th>
                  <Th>Rtg</Th>
                  <Th>Sector</Th>
                  <Th align="right">Mat</Th>
                  <Th align="right" group>
                    Z-spd bp
                  </Th>
                  <Th align="right">Model bp</Th>
                  <Th group>Resid bp</Th>
                  <Th align="right">Z</Th>
                  <Th align="right">Pct</Th>
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
                    <Td num align="left" className="text-muted">
                      {r.cusip}
                    </Td>
                    <Td className="font-medium">{r.issuer}</Td>
                    <Td>
                      <Tag>{r.rating}</Tag>
                    </Td>
                    <Td className="text-muted">{r.sector}</Td>
                    <Td num className="text-muted">
                      {fmtDate(r.maturity)}
                    </Td>
                    <Td num group>
                      {r.current_spread.toFixed(1)}
                    </Td>
                    <Td num className="text-muted">
                      {r.model_spread.toFixed(1)}
                    </Td>
                    <Td group>
                      <div className="flex items-center gap-2.5">
                        <Deviation value={r.residual} max={max} />
                        <Signed value={r.residual} digits={1} />
                      </div>
                    </Td>
                    <Td num>
                      <Signed value={r.z_score} digits={2} />
                    </Td>
                    <Td num className="text-muted">
                      {r.percentile.toFixed(1)}
                    </Td>
                  </SelectableRow>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 pb-5 md:px-6">
            <Spec
              items={[
                ["Resid", "Z-SPREAD − MODEL"],
                ["Model", "FITTED ISSUER CURVE"],
                ["Z", "RESID STANDARDISED, 252D"],
                ["Pct", "RANK IN OWN 252D WINDOW"],
                ["Bar", `SCALED TO ${max.toFixed(0)} BP`],
              ]}
            />
          </div>
        </>
      )}
    </Panel>
  );
}
