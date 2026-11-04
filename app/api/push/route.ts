import { route } from "@/lib/api";
import { pushPublicKey, subscribe, subscriptionCount } from "@/lib/push";

export const GET = route(({ user }) => ({ publicKey: pushPublicKey(), devices: subscriptionCount(user.id) }));

// POST is the browser's PushSubscription: { endpoint, keys: { p256dh, auth } }
export const POST = route(({ user, body }) => {
  subscribe(user.id, body);
  return { ok: true };
});
