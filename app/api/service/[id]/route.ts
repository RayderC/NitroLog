import { int, route } from "@/lib/api";
import { deleteService, getService, updateService } from "@/lib/repo/service";

type P = { id: string };

export const GET = route<P>(({ user, params }) => getService(user.id, int(params.id)));

export const PATCH = route<P>(({ user, params, body }) => {
  updateService(user.id, int(params.id), body ?? {});
  return { ok: true };
});

export const DELETE = route<P>(({ user, params }) => {
  deleteService(user.id, int(params.id));
  return { ok: true };
});
