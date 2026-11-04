import { int, route } from "@/lib/api";
import { deleteInventory, updateInventory } from "@/lib/repo/inventory";

type P = { id: string };

export const PATCH = route<P>(({ user, params, body }) => {
  updateInventory(user.id, int(params.id), body ?? {});
  return { ok: true };
});

export const DELETE = route<P>(({ user, params }) => {
  deleteInventory(user.id, int(params.id));
  return { ok: true };
});
