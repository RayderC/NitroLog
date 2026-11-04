import { int, route } from "@/lib/api";
import { getBuild } from "@/lib/repo/builds";
import { requireVehicle } from "@/lib/repo/vehicles";

export const GET = route<{ id: string }>(({ user, params }) => getBuild(requireVehicle(user.id, int(params.id)).id));
