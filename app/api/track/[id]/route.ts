import { int, route } from "@/lib/api";
import { deleteTrackDay, updateTrackDay } from "@/lib/repo/track";

type P = { id: string };

export const PATCH = route<P>(({ user, params, body }) => {
  updateTrackDay(user.id, int(params.id), body ?? {});
  return { ok: true };
});

export const DELETE = route<P>(({ user, params }) => {
  deleteTrackDay(user.id, int(params.id));
  return { ok: true };
});
