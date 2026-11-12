import { route } from "@/lib/api";
import { addWatch, listWatches } from "@/lib/priceWatch";

/** Your watched parts. */
export const GET = route(({ user }) => listWatches(user.id));

/** Starts watching a part's store link. */
export const POST = route(({ user, body }) => addWatch(user.id, body));
