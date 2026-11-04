"use client";

import { fmtDate } from "./client";
import type { ScheduleItem } from "./types";
import { fmtReading, meterUnit, readingToInput, type DistanceUnit } from "./units";

/** "Every 5,000 mi or 6 months" */
export function intervalText(i: Pick<ScheduleItem, "intervalReading" | "intervalMonths" | "meterType">, du: DistanceUnit): string {
  const parts: string[] = [];
  if (i.intervalReading !== null) parts.push(`${readingToInput(i.intervalReading, i.meterType, du).toLocaleString()} ${meterUnit(i.meterType, du)}`);
  if (i.intervalMonths !== null) parts.push(`${i.intervalMonths} ${i.intervalMonths === 1 ? "month" : "months"}`);
  return `Every ${parts.join(" or ")}`;
}

function days(n: number) {
  return `${n.toLocaleString()} ${n === 1 ? "day" : "days"}`;
}

/** "320 mi over · 12 days left" */
export function dueText(i: ScheduleItem, du: DistanceUnit): string {
  if (i.status === "unknown") return "Add a current reading to track this";
  const parts: string[] = [];
  if (i.remaining !== null) {
    const amount = fmtReading(Math.abs(i.remaining), i.meterType, du);
    parts.push(i.remaining <= 0 ? `${amount} over` : `${amount} left`);
  }
  if (i.daysLeft !== null) {
    if (i.daysLeft < 0) parts.push(`${days(-i.daysLeft)} late`);
    else if (i.daysLeft === 0) parts.push("due today");
    else if (i.daysLeft <= 60) parts.push(`${days(i.daysLeft)} left`);
    else parts.push(`by ${fmtDate(i.dueDate!, { month: "short", year: "numeric" })}`);
  }
  return parts.join(" · ");
}

export const STATUS_BADGE: Record<ScheduleItem["status"], { label: string; cls: string }> = {
  overdue: { label: "Overdue", cls: "badge-red" },
  soon: { label: "Due soon", cls: "badge-gold" },
  ok: { label: "OK", cls: "badge-green" },
  unknown: { label: "No reading", cls: "badge-purple" },
};
