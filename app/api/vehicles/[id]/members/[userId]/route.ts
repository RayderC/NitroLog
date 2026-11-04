import { int, route } from "@/lib/api";
import { removeMember, setMemberRole } from "@/lib/repo/vehicles";

type P = { id: string; userId: string };

export const PATCH = route<P>(({ user, params, body }) => {
  setMemberRole(user.id, int(params.id), params.userId, body?.role);
  return { ok: true };
});

export const DELETE = route<P>(({ user, params }) => {
  removeMember(user.id, int(params.id), int(params.userId));
  return { ok: true };
});
