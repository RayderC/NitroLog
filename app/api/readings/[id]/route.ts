import { int, route } from "@/lib/api";
import { deleteReading } from "@/lib/repo/vehicles";

export const DELETE = route<{ id: string }>(({ user, params }) => {
  deleteReading(user.id, int(params.id));
  return { ok: true };
});
