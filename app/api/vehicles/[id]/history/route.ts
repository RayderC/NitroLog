import { int, route } from "@/lib/api";
import { getService, listService } from "@/lib/repo/service";
import { listSpecs } from "@/lib/repo/specs";
import { requireVehicle } from "@/lib/repo/vehicles";

/** Everything the printable history needs, in one request. */
export const GET = route<{ id: string }>(({ user, params }) => {
  const vehicle = requireVehicle(user.id, int(params.id));
  return {
    vehicle,
    service: listService(vehicle.id).map(s => getService(user.id, s.id)),
    specs: listSpecs(vehicle.id),
  };
});
