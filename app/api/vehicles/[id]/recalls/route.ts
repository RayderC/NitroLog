import { HttpError, int, route } from "@/lib/api";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkVehicleRecalls, listRecalls, recallsCheckedAt, setRecallStatus } from "@/lib/recalls";
import { requireVehicle } from "@/lib/repo/vehicles";

type P = { id: string };

/** Open recalls for a vehicle, and when NHTSA was last asked. */
export const GET = route<P>(({ user, params }) => {
  const id = requireVehicle(user.id, int(params.id)).id;
  return { recalls: listRecalls(id), checkedAt: recallsCheckedAt(id) };
});

/** Checks NHTSA now instead of waiting for the weekly check. Never alerts: the page shows what it finds. */
export const POST = route<P>(async ({ user, params }) => {
  const id = requireVehicle(user.id, int(params.id)).id;
  if (!checkRateLimit(`recalls:${user.id}`, 6, 10 * 60_000)) throw new HttpError(429, "Checked recently. Try again in a few minutes.");
  try { await checkVehicleRecalls(id); }
  catch { throw new HttpError(502, "Couldn't reach NHTSA's recall list. Try again later."); }
  // A recall found by checking by hand has been seen, so the weekly check won't alert about it.
  const { db } = await import("@/lib/db");
  db.prepare("UPDATE vehicle_recalls SET notified = 1 WHERE vehicle_id = ?").run(id);
  return { recalls: listRecalls(id), checkedAt: recallsCheckedAt(id) };
});

/** Marks a recall done, or not for this car. Either hides it. */
export const PATCH = route<P>(({ user, params, body }) => {
  const id = requireVehicle(user.id, int(params.id), "edit").id;
  setRecallStatus(id, body?.campaign, body?.status);
  return { recalls: listRecalls(id), checkedAt: recallsCheckedAt(id) };
});
