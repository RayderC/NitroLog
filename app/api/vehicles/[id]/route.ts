import { int, route } from "@/lib/api";
import { deleteVehicle, listReadings, requireVehicle, updateVehicle } from "@/lib/repo/vehicles";

type P = { id: string };

export const GET = route<P>(({ user, params }) => {
  const vehicle = requireVehicle(user.id, int(params.id));
  return { vehicle, readings: listReadings(vehicle.id) };
});

export const PATCH = route<P>(({ user, params, body }) => {
  updateVehicle(user.id, int(params.id), body ?? {});
  return { ok: true };
});

export const DELETE = route<P>(({ user, params }) => {
  deleteVehicle(user.id, int(params.id));
  return { ok: true };
});
