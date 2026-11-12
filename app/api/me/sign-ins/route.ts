import { getSession, route } from "@/lib/api";
import { listSignIns, signOutEverywhere } from "@/lib/signIns";

export const GET = route(({ user }) => listSignIns(user.id));

/** Signs out every other device and keeps this one. */
export const POST = route(async ({ user }) => {
  const v = signOutEverywhere(user.id);
  const session = await getSession();
  session.user = { id: user.id, username: user.username, v };
  await session.save();
  return { ok: true };
});
