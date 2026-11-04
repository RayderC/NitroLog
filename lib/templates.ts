// Starter schedules by vehicle kind. These are generic starting points, not factory data; the UI says so.

export type VehicleKind = "car" | "motorcycle" | "powersports" | "track" | "project" | "other";

export const KINDS: { value: VehicleKind; label: string }[] = [
  { value: "car", label: "Car / truck" },
  { value: "motorcycle", label: "Motorcycle" },
  { value: "powersports", label: "ATV / powersports" },
  { value: "track", label: "Track car" },
  { value: "project", label: "Project car" },
  { value: "other", label: "Other" },
];

export type TemplateItem = { name: string; mi?: number; km?: number; hours?: number; months?: number };

const CAR: TemplateItem[] = [
  { name: "Engine oil & filter", mi: 5000, km: 8000, months: 6 },
  { name: "Tire rotation", mi: 6000, km: 10000 },
  { name: "Brake inspection", mi: 12000, km: 20000, months: 12 },
  { name: "Engine air filter", mi: 15000, km: 25000, months: 24 },
  { name: "Cabin air filter", mi: 15000, km: 25000, months: 12 },
  { name: "Battery test", months: 12 },
  { name: "Brake fluid", months: 24 },
  { name: "Coolant", mi: 60000, km: 100000, months: 60 },
  { name: "Transmission fluid", mi: 60000, km: 100000 },
  { name: "Spark plugs", mi: 60000, km: 100000 },
];

const TEMPLATES: Record<VehicleKind, TemplateItem[]> = {
  car: CAR,
  project: CAR,
  motorcycle: [
    { name: "Chain clean & lube", mi: 500, km: 800 },
    { name: "Chain tension check", mi: 1000, km: 1500 },
    { name: "Engine oil & filter", mi: 4000, km: 6000, months: 12 },
    { name: "Tire inspection", months: 3 },
    { name: "Air filter", mi: 8000, km: 12000, months: 24 },
    { name: "Spark plugs", mi: 8000, km: 12000 },
    { name: "Valve clearance check", mi: 16000, km: 24000 },
    { name: "Brake fluid", months: 24 },
    { name: "Coolant", months: 24 },
  ],
  powersports: [
    { name: "Air filter clean", hours: 25, months: 6 },
    { name: "Driveline grease", hours: 25 },
    { name: "Engine oil & filter", hours: 50, months: 12 },
    { name: "CVT belt inspection", hours: 50 },
    { name: "Spark plug", hours: 100, months: 12 },
    { name: "Brake fluid", months: 24 },
    { name: "Coolant", months: 24 },
  ],
  track: [
    { name: "Nut & bolt check", months: 3 },
    { name: "Brake pad inspection", mi: 1000, km: 1500, months: 3 },
    { name: "Brake fluid bleed", months: 6 },
    { name: "Engine oil & filter", mi: 3000, km: 5000, months: 6 },
    { name: "Differential fluid", mi: 6000, km: 10000, months: 12 },
    { name: "Transmission fluid", mi: 12000, km: 20000, months: 12 },
  ],
  other: [],
};

/** Items that can be tracked on this vehicle's meter: a time limit, or a limit in the unit it actually records. */
export function templateFor(kind: VehicleKind, meter: "distance" | "hours"): TemplateItem[] {
  return (TEMPLATES[kind] ?? []).filter(t => t.months !== undefined || (meter === "hours" ? t.hours !== undefined : t.mi !== undefined));
}

export const defaultMeter = (kind: VehicleKind): "distance" | "hours" => (kind === "powersports" ? "hours" : "distance");
