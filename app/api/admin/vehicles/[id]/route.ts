import { bad, int, route } from "@/lib/api";
import { adminDeleteVehicle, transferVehicle } from "@/lib/repo/users";

type P = { id: string };

// PATCH { ownerId }: gives the vehicle to someone else.
export const PATCH = route<P>(({ params, body }) => {
  if (!Number.isInteger(body?.ownerId)) throw bad("Choose who gets it");
  transferVehicle(int(params.id), body.ownerId);
  return { ok: true };
}, { admin: true });

export const DELETE = route<P>(({ params }) => { adminDeleteVehicle(int(params.id)); return { ok: true }; }, { admin: true });
