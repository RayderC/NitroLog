import { int, route } from "@/lib/api";
import { addMember, listMembers, requireVehicle } from "@/lib/repo/vehicles";

type P = { id: string };

export const GET = route<P>(({ user, params }) => listMembers(requireVehicle(user.id, int(params.id), "owner").id));

// POST { username, role } adds someone, or changes their role if they're already on the vehicle.
export const POST = route<P>(({ user, params, body }) => {
  addMember(user.id, int(params.id), body ?? {});
  return { ok: true };
});
