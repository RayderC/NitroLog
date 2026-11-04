import { int, route } from "@/lib/api";
import { buildType, createBuildItem } from "@/lib/repo/builds";

export const POST = route<{ id: string; type: string }>(({ user, params, body }) => ({
  id: createBuildItem(user.id, int(params.id), buildType(params.type), body ?? {}),
}));
