import { route } from "@/lib/api";
import { createVehicle, listVehicles } from "@/lib/repo/vehicles";

export const GET = route(({ user }) => listVehicles(user.id));

export const POST = route(({ user, body }) => ({ id: createVehicle(user.id, user.distance_unit, body ?? {}) }));
