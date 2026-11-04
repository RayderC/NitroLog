import { int, route } from "@/lib/api";
import { deleteSpec, updateSpec } from "@/lib/repo/specs";

type P = { id: string };

export const PATCH = route<P>(({ user, params, body }) => {
  updateSpec(user.id, int(params.id), body ?? {});
  return { ok: true };
});

export const DELETE = route<P>(({ user, params }) => {
  deleteSpec(user.id, int(params.id));
  return { ok: true };
});
