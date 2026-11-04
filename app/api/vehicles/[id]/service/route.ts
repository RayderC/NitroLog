import { int, route } from "@/lib/api";
import { createService, listService } from "@/lib/repo/service";
import { requireVehicle } from "@/lib/repo/vehicles";

type P = { id: string };

export const GET = route<P>(({ user, params }) => listService(requireVehicle(user.id, int(params.id)).id));

export const POST = route<P>(({ user, params, body }) => ({ id: createService(user.id, int(params.id), body ?? {}) }));
