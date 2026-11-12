import { HttpError, int, route } from "@/lib/api";
import { db } from "@/lib/db";
import { listSignIns, signOutEverywhere } from "@/lib/signIns";

type P = { id: string };

export const GET = route<P>(({ params }) => listSignIns(int(params.id)), { admin: true });

/** Signs someone out of every device. People sign themselves out of other devices in Settings. */
export const POST = route<P>(({ user, params }) => {
  const id = int(params.id);
  if (id === user.id) throw new HttpError(400, "Use Settings to sign out your other devices");
  if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(id)) throw new HttpError(404, "User not found");
  signOutEverywhere(id);
  return { ok: true };
}, { admin: true });
