import { route, todayParam } from "@/lib/api";
import { dueAcross } from "@/lib/repo/schedule";

export const GET = route(({ req, user }) => dueAcross(user.id, todayParam(req)));
