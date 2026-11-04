import { route } from "@/lib/api";
import { createUser, listUsers } from "@/lib/repo/users";

export const GET = route(() => listUsers(), { admin: true });

// POST { username, password, isAdmin? }
export const POST = route(({ body }) => ({ id: createUser(body?.username, body?.password, body?.isAdmin) }), { admin: true });
