// Decides who gets told what, separately from sending it. Runs under `node --test`.
import { daysBetween, type DueStatus } from "./due.ts";

export type PushItem = { id: number; name: string; vehicleName: string; status: DueStatus };
export type PushSent = { status: string; sentOn: string };

const OVERDUE_REMINDER_DAYS = 14;

/**
 * Tell people once when an item becomes due soon, once when it becomes overdue, then every 14 days while
 * it stays overdue. An item back to OK is forgotten, so its next cycle notifies again.
 */
export function decidePush(items: PushItem[], sent: Map<number, PushSent>, today: string) {
  const notify: PushItem[] = [];
  const clear: number[] = [];
  for (const i of items) {
    const prev = sent.get(i.id);
    if (i.status === "ok" || i.status === "unknown") {
      if (prev) clear.push(i.id);
    } else if (i.status === "soon") {
      if (!prev) notify.push(i);
    } else if (prev?.status !== "overdue" || daysBetween(prev.sentOn, today) >= OVERDUE_REMINDER_DAYS) {
      notify.push(i);
    }
  }
  return { notify, clear };
}

export function pushMessage(items: PushItem[]): { title: string; body: string } {
  const overdue = items.filter(i => i.status === "overdue").length;
  const title = items.length === 1
    ? `${items[0].name}: ${items[0].status === "overdue" ? "overdue" : "due soon"}`
    : `${items.length} services need attention${overdue ? ` (${overdue} overdue)` : ""}`;
  const lines = items.slice(0, 4).map(i => `${i.vehicleName}: ${i.name}`);
  if (items.length > 4) lines.push(`and ${items.length - 4} more`);
  return { title, body: lines.join("\n") };
}
