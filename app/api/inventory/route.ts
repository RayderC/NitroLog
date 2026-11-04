import { route } from "@/lib/api";
import { createInventory, listInventory } from "@/lib/repo/inventory";

export const GET = route(({ user }) => listInventory(user.id));

export const POST = route(({ user, body }) => ({ id: createInventory(user.id, body ?? {}) }));
