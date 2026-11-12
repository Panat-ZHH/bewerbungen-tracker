import { Select } from "@/components/ui/input";
import { DEFAULT_RADIUS_KM, RADIUS_OPTIONS, radiusLabel } from "./engine";

/**
 * Radius around the chosen place: "Nur dieser Ort", 5, 10 (default), 20, 30, 50 km. Without a place it is disabled –
 * a radius needs a centre. Look: Agent A, see HANDOFF.md – class `radius-select`.
 */
export function RadiusSelect({ id, value, onChange, disabled = false }: { id: string; value?: number; onChange: (km: number) => void; disabled?: boolean }) {
  return (
    <Select id={id} className="radius-select" disabled={disabled} value={disabled ? "" : String(value ?? DEFAULT_RADIUS_KM)} onChange={(event) => { if (event.target.value !== "") onChange(Number(event.target.value)); }}>
      {disabled && <option value="">Zuerst einen Ort wählen</option>}
      {!disabled && RADIUS_OPTIONS.map((km) => <option key={km} value={km}>{radiusLabel(km)}</option>)}
    </Select>
  );
}
