import { api } from "../api/client";
import { useApi } from "../hooks/useApi";

interface Props {
  value: string | null;
  onChange: (issuer: string) => void;
}

// Issuer filter / selector driving the curve + time-series panels.
export function IssuerSelector({ value, onChange }: Props) {
  const { data } = useApi<string[]>(() => api.issuers(), []);
  return (
    <select
      className="bg-panelLight border border-gray-700 rounded text-sm px-3 py-1.5"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled>
        Select issuer…
      </option>
      {data?.map((i) => (
        <option key={i} value={i}>
          {i}
        </option>
      ))}
    </select>
  );
}
