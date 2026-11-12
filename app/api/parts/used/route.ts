import { route } from "@/lib/api";
import { usedParts } from "@/lib/repo/partsHistory";

/** Every part used on the vehicles you can see, for the Parts page. */
export const GET = route(({ user }) => usedParts(user.id));
