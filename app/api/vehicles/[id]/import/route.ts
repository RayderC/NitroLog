import { int, route } from "@/lib/api";
import { importRows } from "@/lib/repo/import";

export const POST = route<{ id: string }>(({ user, params, body }) => importRows(user.id, int(params.id), body));
