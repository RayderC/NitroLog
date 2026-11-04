import { int, route, todayParam } from "@/lib/api";
import { createSchedule, listSchedule } from "@/lib/repo/schedule";
import { requireVehicle } from "@/lib/repo/vehicles";

type P = { id: string };

export const GET = route<P>(({ req, user, params }) => listSchedule(requireVehicle(user.id, int(params.id)), todayParam(req)));

export const POST = route<P>(({ user, params, body }) => ({ id: createSchedule(user.id, int(params.id), body ?? {}) }));
