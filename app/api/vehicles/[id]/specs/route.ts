import { int, route } from "@/lib/api";
import { createSpec, listSpecs } from "@/lib/repo/specs";
import { requireVehicle } from "@/lib/repo/vehicles";

type P = { id: string };

export const GET = route<P>(({ user, params }) => listSpecs(requireVehicle(user.id, int(params.id)).id));

export const POST = route<P>(({ user, params, body }) => ({ id: createSpec(user.id, int(params.id), body ?? {}) }));
