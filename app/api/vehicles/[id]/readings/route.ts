import { int, route } from "@/lib/api";
import { addReading } from "@/lib/repo/vehicles";

export const POST = route<{ id: string }>(({ user, params, body }) => {
  addReading(user.id, int(params.id), body ?? {});
  return { ok: true };
});
