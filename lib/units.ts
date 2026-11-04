// Stored values are always meters, liters, engine hours and whole cents. Convert only for display and input.

export type DistanceUnit = "mi" | "km";
export type VolumeUnit = "gal" | "L";
export type MeterType = "distance" | "hours";

const M_PER_MI = 1609.344;
const L_PER_GAL = 3.785411784;

export const toMeters = (v: number, u: DistanceUnit) => (u === "mi" ? v * M_PER_MI : v * 1000);
export const fromMeters = (m: number, u: DistanceUnit) => (u === "mi" ? m / M_PER_MI : m / 1000);
export const toLiters = (v: number, u: VolumeUnit) => (u === "gal" ? v * L_PER_GAL : v);
export const fromLiters = (l: number, u: VolumeUnit) => (u === "gal" ? l / L_PER_GAL : l);

export const meterUnit = (meter: MeterType, du: DistanceUnit) => (meter === "hours" ? "hr" : du);

const KPA_PER_PSI = 6.894757;

/** Tire pressure follows the distance setting: psi with miles, kPa with kilometers. */
export const pressureUnit = (du: DistanceUnit) => (du === "mi" ? "psi" : "kPa");
export const toKpa = (v: number, du: DistanceUnit) => (du === "mi" ? v * KPA_PER_PSI : v);
export const fromKpa = (kpa: number, du: DistanceUnit) => (du === "mi" ? Math.round((kpa / KPA_PER_PSI) * 10) / 10 : Math.round(kpa));

/** A stored reading or interval as the number to show or prefill in a form. */
export function readingToInput(stored: number, meter: MeterType, du: DistanceUnit): number {
  return meter === "hours" ? Math.round(stored * 10) / 10 : Math.round(fromMeters(stored, du));
}

export function readingFromInput(v: number, meter: MeterType, du: DistanceUnit): number {
  return meter === "hours" ? v : toMeters(v, du);
}

export function fmtReading(stored: number | null, meter: MeterType, du: DistanceUnit): string {
  if (stored === null) return "—";
  return `${readingToInput(stored, meter, du).toLocaleString()} ${meterUnit(meter, du)}`;
}

export function toCents(v: number): number {
  return Math.round(v * 100);
}

export function fmtMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Fuel economy from meters per liter: mpg (US) for mi + gal, L/100 km for km + L, otherwise the unit pair asked for. */
export function fmtEconomy(metersPerLiter: number | null | undefined, du: DistanceUnit, vu: VolumeUnit): string {
  if (!metersPerLiter) return "—";
  if (du === "km" && vu === "L") return `${(100_000 / metersPerLiter).toFixed(1)} L/100 km`;
  const value = fromMeters(metersPerLiter, du) / fromLiters(1, vu);
  return `${value.toFixed(1)} ${du === "mi" ? "mi" : "km"}/${vu}`.replace("mi/gal", "mpg");
}
