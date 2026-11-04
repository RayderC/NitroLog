import { HttpError, bad, route } from "@/lib/api";
import { checkRateLimit } from "@/lib/rateLimit";

// VINs never contain I, O or Q. Older vehicles can have fewer than 17 characters.
const VIN = /^[A-HJ-NPR-Z0-9]{11,17}$/;

/** Decodes through NHTSA's free vPIC API. Coverage is mainly US-market vehicles, so forms always allow typing instead. */
export const GET = route<{ vin: string }>(async ({ user, params }) => {
  const vin = params.vin.toUpperCase();
  if (!VIN.test(vin)) throw bad("That doesn't look like a VIN");
  if (!checkRateLimit(`vin:${user.id}`, 30, 60_000)) throw new HttpError(429, "Slow down");

  let row: Record<string, string>;
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`vPIC ${res.status}`);
    row = (await res.json()).Results?.[0] ?? {};
  } catch (e) {
    console.error("[vin]", e);
    throw new HttpError(502, "VIN lookup isn't available right now. You can type the details in.");
  }
  if (!row.Make) throw new HttpError(404, "Couldn't decode that VIN. You can type the details in.");

  const litres = row.DisplacementL ? `${Number(row.DisplacementL).toFixed(1)}L` : "";
  const cylinders = row.EngineCylinders ? `${row.EngineCylinders}-cyl` : "";
  return {
    year: row.ModelYear ? Number(row.ModelYear) : null,
    make: row.Make,
    model: row.Model || null,
    trim: row.Trim || null,
    engine: [litres, cylinders, row.FuelTypePrimary].filter(Boolean).join(" ") || null,
  };
});
