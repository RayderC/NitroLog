import { int, route } from "@/lib/api";
import { buildType, deleteBuildItem, updateBuildItem } from "@/lib/repo/builds";

type P = { type: string; itemId: string };

export const PATCH = route<P>(({ user, params, body }) => {
  updateBuildItem(user.id, buildType(params.type), int(params.itemId), body ?? {});
  return { ok: true };
});

export const DELETE = route<P>(({ user, params }) => {
  deleteBuildItem(user.id, buildType(params.type), int(params.itemId));
  return { ok: true };
});
