import { int, route } from "@/lib/api";
import { createTrackDay, listTrack } from "@/lib/repo/track";
import { requireVehicle } from "@/lib/repo/vehicles";

type P = { id: string };

export const GET = route<P>(({ user, params }) => listTrack(requireVehicle(user.id, int(params.id)).id));

export const POST = route<P>(({ user, params, body }) => ({ id: createTrackDay(user.id, int(params.id), body ?? {}) }));
