import { route } from "@/lib/api";
import { reports } from "@/lib/repo/reports";

export const GET = route(({ user }) => reports(user.id));
