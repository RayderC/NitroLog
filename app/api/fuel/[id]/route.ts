import { int, route } from "@/lib/api";
import { deleteFuel, updateFuel } from "@/lib/repo/fuelLogs";

type P = { id: string };

export const PATCH = route<P>(({ user, params, body }) => {
  updateFuel(user.id, int(params.id), body ?? {});
  return { ok: true };
});

export const DELETE = route<P>(({ user, params }) => {
  deleteFuel(user.id, int(params.id));
  return { ok: true };
});
