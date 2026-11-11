import { int, route } from "@/lib/api";
import { partsHistory } from "@/lib/repo/partsHistory";

type P = { id: string };

/** Parts and prices the service form offers while you type. */
export const GET = route<P>(({ user, params }) => partsHistory(user.id, int(params.id)));
