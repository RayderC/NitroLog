import { route } from "@/lib/api";
import { deleteWatch, setWatchEnabled } from "@/lib/priceWatch";

type P = { id: string };

export const PATCH = route<P>(({ user, params, body }) => { setWatchEnabled(user.id, params.id, body?.enabled); return { ok: true }; });
export const DELETE = route<P>(({ user, params }) => { deleteWatch(user.id, params.id); return { ok: true }; });
