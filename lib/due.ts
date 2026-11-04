// Pure service-due logic. No imports, so it runs on both sides and under `node --test`.

export type DueStatus = "overdue" | "soon" | "ok" | "unknown";

export type DueInput = {
  current: number | null;
  lastReading: number | null;
  lastDate: string;
  intervalReading: number | null;
  intervalMonths: number | null;
  today: string;
};

export type DueResult = {
  status: DueStatus;
  dueReading: number | null;
  remaining: number | null;
  dueDate: string | null;
  daysLeft: number | null;
  /** Fraction of the interval left on the tighter limit. Lower is more urgent; below 0 is overdue. */
  urgency: number;
};

const SOON_FRACTION = 0.1;
const SOON_DAYS = 30;

const dayMs = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Adds calendar months, clamping to the last day of a shorter month (Jan 31 + 1 month = Feb 28). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${year}-${p(month + 1)}-${p(Math.min(d, lastDay))}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dayMs(to) - dayMs(from)) / 86_400_000);
}

/** Whichever limit comes first wins: a service is overdue when either its reading or its date has passed. */
export function computeDue(i: DueInput): DueResult {
  let dueReading: number | null = null;
  let remaining: number | null = null;
  if (i.intervalReading !== null && i.lastReading !== null) {
    dueReading = i.lastReading + i.intervalReading;
    if (i.current !== null) remaining = dueReading - i.current;
  }

  let dueDate: string | null = null;
  let daysLeft: number | null = null;
  if (i.intervalMonths !== null) {
    dueDate = addMonths(i.lastDate, i.intervalMonths);
    daysLeft = daysBetween(i.today, dueDate);
  }

  if (remaining === null && daysLeft === null) {
    return { status: "unknown", dueReading, remaining, dueDate, daysLeft, urgency: Infinity };
  }

  const fractions: number[] = [];
  if (remaining !== null) fractions.push(remaining / i.intervalReading!);
  if (daysLeft !== null) fractions.push(daysLeft / Math.max(1, daysBetween(i.lastDate, dueDate!)));
  const urgency = Math.min(...fractions);

  const overdue = (remaining !== null && remaining <= 0) || (daysLeft !== null && daysLeft <= 0);
  const soon = (remaining !== null && remaining <= i.intervalReading! * SOON_FRACTION) || (daysLeft !== null && daysLeft <= SOON_DAYS);
  return { status: overdue ? "overdue" : soon ? "soon" : "ok", dueReading, remaining, dueDate, daysLeft, urgency };
}
