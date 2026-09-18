import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { Select } from "./ui";

interface Props {
  value: string | null;
  onChange: (issuer: string) => void;
}

// Issuer picker in the sticky bar, driving the curve and history panels.
export function IssuerSelector({ value, onChange }: Props) {
  const { data } = useApi<string[]>(() => api.issuers(), []);
  return (
    <Select
      compact
      label="Issuer"
      placeholder="Choose an issuer"
      value={value ?? ""}
      onChange={onChange}
      options={(data ?? []).map((i) => ({ value: i, label: i }))}
    />
  );
}
