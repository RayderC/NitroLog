import { HttpError, bad, route, todayParam } from "@/lib/api";
import { checkRateLimit } from "@/lib/rateLimit";
import { exportCsv, exportJson, exportZip } from "@/lib/repo/export";

export const GET = route(({ req, user }) => {
  if (!checkRateLimit(`export:${user.id}`, 10, 60_000)) throw new HttpError(429, "Slow down");
  const format = req.nextUrl.searchParams.get("format");
  const today = todayParam(req);
  const name = `nitrolog-${today}`;
  const headers = (type: string, ext: string) => ({ "Content-Type": type, "Content-Disposition": `attachment; filename="${name}.${ext}"`, "Cache-Control": "no-store" });
  if (format === "json") return new Response(JSON.stringify(exportJson(user.id, today), null, 2), { headers: headers("application/json", "json") });
  if (format === "csv") return new Response(exportCsv(user.id, user.distance_unit, user.volume_unit), { headers: headers("text/csv; charset=utf-8", "csv") });
  if (format === "zip") return new Response(exportZip(user.id, today), { headers: headers("application/zip", "zip") });
  throw bad("Choose csv, json or zip");
});
