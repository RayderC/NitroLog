import { int, route } from "@/lib/api";
import { createFuel, listFuel } from "@/lib/repo/fuelLogs";
import { requireVehicle } from "@/lib/repo/vehicles";

type P = { id: string };

export const GET = route<P>(({ user, params }) => listFuel(requireVehicle(user.id, int(params.id)).id));

export const POST = route<P>(({ user, params, body }) => ({ id: createFuel(user.id, int(params.id), body ?? {}) }));
