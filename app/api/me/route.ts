import { route, bad } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = route(({ user }) => ({
  id: user.id,
  username: user.username,
  isAdmin: !!user.is_admin,
  distanceUnit: user.distance_unit,
  volumeUnit: user.volume_unit,
}));

export const PATCH = route(({ user, body }) => {
  const b = body ?? {};
  if (b.distanceUnit !== undefined) {
    if (!["mi", "km"].includes(b.distanceUnit)) throw bad("Invalid unit");
    db.prepare("UPDATE users SET distance_unit = ? WHERE id = ?").run(b.distanceUnit, user.id);
  }
  if (b.volumeUnit !== undefined) {
    if (!["gal", "L"].includes(b.volumeUnit)) throw bad("Invalid unit");
    db.prepare("UPDATE users SET volume_unit = ? WHERE id = ?").run(b.volumeUnit, user.id);
  }
  return { ok: true };
});
