import { int, route } from "@/lib/api";
import { deleteSchedule, updateSchedule } from "@/lib/repo/schedule";

type P = { id: string };

export const PATCH = route<P>(({ user, params, body }) => {
  updateSchedule(user.id, int(params.id), body ?? {});
  return { ok: true };
});

export const DELETE = route<P>(({ user, params }) => {
  deleteSchedule(user.id, int(params.id));
  return { ok: true };
});
