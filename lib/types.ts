// Shapes shared by API routes and pages. Safe to import on both sides.
import type { DueStatus } from "./due";
import type { VehicleKind } from "./templates";
import type { MeterType } from "./units";

export type { MeterType };

export type Role = "owner" | "editor" | "viewer";

export type Vehicle = {
  id: number;
  name: string;
  kind: VehicleKind;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  engine: string | null;
  vin: string | null;
  plate: string | null;
  meterType: MeterType;
  currency: string;
  notes: string | null;
  archived: boolean;
  /** Set when the vehicle has been sold. Sold vehicles are also archived. */
  soldOn: string | null;
  /** Sale price. Only the owner gets this: people the vehicle is shared with see null. */
  soldCents: number | null;
  /** Highest reading across manual updates, service records and fill-ups. */
  reading: number | null;
  role: Role;
  ownerName: string;
  shared: boolean;
};

export type ScheduleItem = {
  id: number;
  vehicleId: number;
  vehicleName: string;
  meterType: MeterType;
  name: string;
  notes: string | null;
  intervalReading: number | null;
  intervalMonths: number | null;
  baseDate: string;
  baseReading: number | null;
  lastDate: string;
  lastReading: number | null;
  status: DueStatus;
  dueReading: number | null;
  remaining: number | null;
  dueDate: string | null;
  daysLeft: number | null;
  urgency: number;
  canEdit: boolean;
};

export type ServiceItem = {
  kind: "part" | "fluid";
  name: string;
  partNumber: string | null;
  brand: string | null;
  quantity: number | null;
  unit: string | null;
  costCents: number;
  inventoryId: number | null;
};

export type ServiceSummary = {
  id: number;
  vehicleId: number;
  date: string;
  reading: number | null;
  title: string;
  category: string;
  laborHours: number | null;
  laborCostCents: number;
  notes: string | null;
  totalCents: number;
  loggedBy: string | null;
};

export type ServiceDetail = ServiceSummary & { items: ServiceItem[]; scheduleIds: number[] };

/** A part the service form can fill in: one you've used before, or one on your shelf. */
export type PartSuggestion = {
  source: "history" | "stock";
  kind: ServiceItem["kind"];
  name: string;
  partNumber: string | null;
  brand: string | null;
  unit: string | null;
  /** How many were used last time. */
  quantity: number | null;
  /** The latest price for one unit, in cents. Null when no price was ever recorded. */
  unitCostCents: number | null;
  lastDate: string | null;
  uses: number;
  onThisVehicle: boolean;
  vehicleName: string | null;
  inventoryId: number | null;
  onHand: number | null;
};

export type PartsHistory = {
  parts: PartSuggestion[];
  /** Per schedule item id: the parts on the last record on this vehicle that covered it. */
  lastByTask: Record<number, { serviceId: number; date: string; items: ServiceItem[] }>;
};

export const SERVICE_CATEGORIES = ["maintenance", "repair", "inspection", "upgrade", "other"] as const;

export type Spec = { id: number; label: string; value: string; notes: string | null };

export type FuelLog = {
  id: number;
  date: string;
  reading: number | null;
  volumeL: number;
  costCents: number;
  fullTank: boolean;
  notes: string | null;
  economy: number | null;
};

export type ReadingEntry = {
  id: number;
  source: "manual" | "service" | "fuel";
  date: string;
  reading: number;
  by: string | null;
};

export type Member = { userId: number; username: string; role: "editor" | "viewer" };

export type InventoryItem = {
  id: number;
  vehicleId: number | null;
  vehicleName: string | null;
  name: string;
  partNumber: string | null;
  brand: string | null;
  /** On hand now: stocked minus what service records have used. */
  quantity: number;
  unit: string | null;
  location: string | null;
  unitCostCents: number;
  minQuantity: number | null;
  notes: string | null;
};

export const ATTACHMENT_CATEGORIES = ["photo", "receipt", "insurance", "registration", "manual", "other"] as const;

export type Attachment = {
  id: number;
  vehicleId: number;
  serviceId: number | null;
  buildLogId: number | null;
  category: string;
  filename: string;
  mime: string;
  size: number;
  caption: string | null;
  createdAt: string;
  by: string | null;
};

export type VehicleReport = {
  vehicleId: number;
  name: string;
  currency: string;
  meterType: MeterType;
  archived: boolean;
  soldOn: string | null;
  soldCents: number | null;
  byCategory: { category: string; cents: number }[];
  byYear: { year: string; cents: number }[];
  serviceCents: number;
  fuelCents: number;
  wishlistCents: number;
  totalCents: number;
  laborHours: number;
  /** Distance or hours between the lowest and highest logged readings. */
  tracked: number;
};

export type BuildTask = { id: number; title: string; done: boolean; hours: number | null };
export type BuildStage = { id: number; name: string; notes: string | null; tasks: BuildTask[] };
export type WishlistItem = {
  id: number; stageId: number | null; name: string; url: string | null; plannedCents: number;
  actualCents: number | null; status: "planned" | "bought" | "installed"; notes: string | null;
};
export type BuildLogEntry = { id: number; date: string; title: string; body: string | null; by: string | null };
export type BuildData = {
  stages: BuildStage[];
  wishlist: WishlistItem[];
  log: BuildLogEntry[];
  totals: {
    plannedCents: number;
    wishlistSpentCents: number;
    upgradeCents: number;
    spentCents: number;
    hours: number;
    tasksDone: number;
    tasksTotal: number;
  };
};

export type TrackSession = {
  name: string | null;
  laps: number | null;
  bestLapMs: number | null;
  pressureFl: number | null;
  pressureFr: number | null;
  pressureRl: number | null;
  pressureRr: number | null;
  notes: string | null;
};
export type TrackDay = {
  id: number; date: string; track: string; conditions: string | null; setup: string | null; notes: string | null; sessions: TrackSession[];
};
export type TrackBest = { track: string; bestLapMs: number | null; visits: number };
