import { HttpError, route } from "@/lib/api";
import { sendToUser } from "@/lib/push";
import { checkRateLimit } from "@/lib/rateLimit";

export const POST = route(async ({ user }) => {
  if (!checkRateLimit(`pushtest:${user.id}`, 5, 60_000)) throw new HttpError(429, "Slow down");
  const delivered = await sendToUser(user.id, { title: "NitroLog", body: "Notifications are working." });
  if (delivered === 0) throw new HttpError(502, "No device accepted the notification. Try turning notifications off and on again.");
  return { delivered };
});
