import { route } from "@/lib/api";
import { listAllVehicles } from "@/lib/repo/users";

/** Every vehicle on the server, with its owner. */
export const GET = route(() => listAllVehicles(), { admin: true });
