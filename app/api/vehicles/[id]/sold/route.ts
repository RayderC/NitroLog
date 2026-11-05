import { int, route } from "@/lib/api";
import { markSold, undoSale } from "@/lib/repo/vehicles";

type P = { id: string };

export const POST = route<P>(({ user, params, body }) => {
  markSold(user.id, int(params.id), body ?? {});
  return { ok: true };
});

export const DELETE = route<P>(({ user, params }) => {
  undoSale(user.id, int(params.id));
  return { ok: true };
});
