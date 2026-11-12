import { route, int } from "@/lib/api";
import { deletePlan, deleteUser, updateUser } from "@/lib/repo/users";

type P = { id: string };

/** What deleting this person would do to their vehicles. */
export const GET = route<P>(({ params }) => deletePlan(int(params.id)), { admin: true });

// PATCH { username?, password?, disabled?, isAdmin? }
export const PATCH = route<P>(({ user, params, body }) => {
  updateUser(user.id, int(params.id), body ?? {});
  return { ok: true };
}, { admin: true });

// DELETE { vehicles?: { [vehicleId]: userId | "delete" } }
export const DELETE = route<P>(async ({ req, user, params }) => {
  const body = await req.json().catch(() => ({})) as { vehicles?: Record<string, unknown> };
  deleteUser(user.id, int(params.id), body?.vehicles && typeof body.vehicles === "object" ? body.vehicles : {});
  return { ok: true };
}, { admin: true });
