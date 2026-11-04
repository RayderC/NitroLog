import { route } from "@/lib/api";
import { unsubscribe } from "@/lib/push";

export const POST = route(({ user, body }) => {
  unsubscribe(user.id, body?.endpoint);
  return { ok: true };
});
