import { int, route } from "@/lib/api";
import { deleteAttachment, updateAttachment } from "@/lib/repo/attachments";

type P = { id: string };

export const PATCH = route<P>(({ user, params, body }) => {
  updateAttachment(user.id, int(params.id), body ?? {});
  return { ok: true };
});

export const DELETE = route<P>(({ user, params }) => {
  deleteAttachment(user.id, int(params.id));
  return { ok: true };
});
