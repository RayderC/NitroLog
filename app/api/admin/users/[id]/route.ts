import { route, int } from "@/lib/api";
import { deleteUser, updateUser } from "@/lib/repo/users";

type P = { id: string };

// PATCH { password?, disabled?, isAdmin? }
export const PATCH = route<P>(({ user, params, body }) => {
  updateUser(user.id, int(params.id), body ?? {});
  return { ok: true };
}, { admin: true });

export const DELETE = route<P>(({ user, params }) => {
  deleteUser(user.id, int(params.id));
  return { ok: true };
}, { admin: true });
