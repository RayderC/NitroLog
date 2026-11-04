// Checks parts, files, reports, export, builds, track days, push and import against a fresh server:
//   node scripts/e2e-features.mjs http://localhost:7100
const BASE = process.argv[2];
import { unzipSync, strFromU8 } from "fflate";
let passed = 0, failed = 0;
const today = new Date().toISOString().slice(0, 10);
function check(name, ok, extra) {
  if (ok) { passed++; console.log("  ok  ", name); }
  else { failed++; console.log("  FAIL", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}
function client() {
  let cookie = "";
  const f = async (method, path, body, headers = {}) => {
    const isForm = body instanceof FormData;
    const res = await fetch(BASE + path, { method, redirect: "manual",
      headers: { ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const type = res.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await res.json().catch(() => null) : new Uint8Array(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  };
  return f;
}
const PW = "correct-horse-battery";
const a = client(), b = client(), c = client();
await a("POST", "/api/setup", { username: "ann", password: PW, distanceUnit: "mi", volumeUnit: "gal" });
const bobId = (await a("POST", "/api/admin/users", { username: "bob", password: PW })).data.id;
const carolId = (await a("POST", "/api/admin/users", { username: "carol", password: PW })).data.id;
await b("POST", "/api/login", { username: "bob", password: PW });
await c("POST", "/api/login", { username: "carol", password: PW });
const mi = n => n * 1609.344;
const car = (await a("POST", "/api/vehicles", { kind: "track", name: "Track Car", reading: mi(1000), today, currency: "USD", templates: [] })).data.id;
const bobCar = (await b("POST", "/api/vehicles", { kind: "other", name: "Bob Car", today })).data.id;
await a("POST", `/api/vehicles/${car}/members`, { username: "bob", role: "viewer" });

// ── Inventory ──
let r = await a("POST", "/api/inventory", { name: "Oil filter", partNumber: "PH1", quantity: 5, unitCostCents: 800, minQuantity: 2, unit: "each" });
check("create inventory", r.status === 200, r.data);
const filter = r.data.id;
const stock = async () => (await a("GET", "/api/inventory")).data.find(i => i.id === filter).quantity;
const svc = extra => ({ date: today, title: "Service", category: "maintenance", laborCostCents: 0, scheduleIds: [], items: [], ...extra });
r = await a("POST", `/api/vehicles/${car}/service`, svc({ items: [{ kind: "part", name: "Oil filter", quantity: 2, costCents: 1600, inventoryId: filter }] }));
const usedSvc = r.data.id;
check("service using stock saved", r.status === 200, r.data);
check("stock drops by quantity used", await stock() === 3);
r = await a("PATCH", `/api/service/${usedSvc}`, svc({ items: [{ kind: "part", name: "Oil filter", quantity: 1, costCents: 800, inventoryId: filter }] }));
check("editing the record corrects stock", await stock() === 4, await stock());
r = await a("GET", `/api/service/${usedSvc}`);
check("record keeps its stock link", r.data.items[0].inventoryId === filter);
await a("DELETE", `/api/service/${usedSvc}`);
check("deleting the record restores stock", await stock() === 5);
r = await a("PATCH", `/api/inventory/${filter}`, { name: "Oil filter", quantity: 7, unitCostCents: 800 });
check("setting on-hand quantity", await stock() === 7);
await a("POST", `/api/vehicles/${car}/service`, svc({ items: [{ kind: "part", name: "x", quantity: 1, inventoryId: filter }] }));
r = await a("PATCH", `/api/inventory/${filter}`, { name: "Oil filter", quantity: 10 });
check("on-hand edit accounts for past use", await stock() === 10, await stock());
r = await b("POST", `/api/vehicles/${bobCar}/service`, svc({ items: [{ kind: "part", name: "stolen", quantity: 1, inventoryId: filter }] }));
check("can't draw from someone else's inventory", r.status === 400, r);
r = await b("PATCH", `/api/inventory/${filter}`, { name: "hacked", quantity: 0 });
check("can't edit someone else's inventory", r.status === 404);
check("inventory is private to its owner", (await b("GET", "/api/inventory")).data.length === 0);
r = await a("POST", "/api/inventory", { name: "No count" });
check("inventory needs a quantity", r.status === 400);
r = await a("POST", "/api/inventory", { name: "For Bob's car", quantity: 1, vehicleId: bobCar });
check("can't earmark a part for a vehicle you can't see", r.status === 404, r.status);

// ── Attachments ──
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
const PDF = new TextEncoder().encode("%PDF-1.4 test");
const upload = (who, vehicle, bytes, name, type, fields = {}) => {
  const f = new FormData();
  f.set("file", new File([bytes], name, { type }));
  for (const [k, v] of Object.entries(fields)) f.set(k, String(v));
  return who("POST", `/api/vehicles/${vehicle}/attachments`, f);
};
r = await upload(a, car, JPEG, "photo.jpg", "image/jpeg", { category: "photo" });
check("upload a photo", r.status === 200 && r.data.mime === "image/jpeg", r.data);
const photo = r.data.id;
r = await upload(a, car, PDF, "receipt.pdf", "application/pdf", { category: "receipt" });
check("upload a PDF", r.status === 200 && r.data.mime === "application/pdf", r.data);
r = await upload(a, car, new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"), "x.svg", "image/svg+xml");
check("SVG rejected", r.status === 400, r.status);
r = await upload(a, car, new TextEncoder().encode("<html><script>alert(1)</script></html>"), "fake.jpg", "image/jpeg");
check("HTML renamed to .jpg rejected", r.status === 400, r.status);
r = await upload(a, car, JPEG, "../../../etc/evil<script>.jpg", "image/jpeg");
check("path and markup stripped from filename", r.status === 200 && !/[\/<>]/.test(r.data.filename), r.data.filename);
r = await upload(b, car, JPEG, "viewer.jpg", "image/jpeg");
check("viewer can't upload", r.status === 403, r.status);
r = await upload(c, car, JPEG, "stranger.jpg", "image/jpeg");
check("stranger can't upload", r.status === 404, r.status);
r = await upload(a, car, new Uint8Array(0), "empty.jpg", "image/jpeg");
check("empty file rejected", r.status === 400);
const big = new Uint8Array(20 * 1024 * 1024); big.set(JPEG);
r = await upload(a, car, big, "big.jpg", "image/jpeg");
check("20 MB upload works", r.status === 200, r.status);
const bigId = r.data?.id;
const huge = new Uint8Array(27 * 1024 * 1024); huge.set(JPEG);
r = await upload(a, car, huge, "huge.jpg", "image/jpeg");
check("27 MB upload refused", r.status === 413, r.status);
await a("DELETE", `/api/attachments/${bigId}`);

r = await a("GET", `/api/attachments/${photo}/file`);
check("owner downloads with exact bytes", r.status === 200 && r.data.length === JPEG.length && r.data[0] === 0xff, r.status);
check("file served with sniff protection", r.headers.get("x-content-type-options") === "nosniff" && r.headers.get("content-type") === "image/jpeg");
r = await b("GET", `/api/attachments/${photo}/file`);
check("shared viewer can download", r.status === 200);
r = await c("GET", `/api/attachments/${photo}/file`);
check("stranger can't download", r.status === 404, r.status);
r = await fetch(`${BASE}/api/attachments/${photo}/file`);
check("signed-out can't download", r.status === 401, r.status);
r = await upload(c, (await c("POST", "/api/vehicles", { kind: "other", name: "Carol", today })).data.id, JPEG, "x.jpg", "image/jpeg", { serviceId: 1 });
check("can't attach to a record on another vehicle", r.status === 400, r.status);
const svcId = (await a("POST", `/api/vehicles/${car}/service`, svc({ title: "With receipt" }))).data.id;
r = await upload(a, car, PDF, "linked.pdf", "application/pdf", { serviceId: svcId });
check("attach to service record", r.status === 200 && r.data.serviceId === svcId);
const linked = r.data.id;
r = await a("GET", `/api/vehicles/${car}/attachments?service=${svcId}`);
check("filtered to that record", r.data.length === 1 && r.data[0].id === linked);
await a("DELETE", `/api/service/${svcId}`);
r = await a("GET", `/api/attachments/${linked}/file`);
check("receipt survives deleting its record", r.status === 200, r.status);

// ── Reports ──
const rep = (await a("POST", "/api/vehicles", { kind: "car", name: "Report Car", reading: mi(10000), today, currency: "EUR", templates: [] })).data.id;
await a("POST", `/api/vehicles/${rep}/service`, svc({ date: "2025-03-01", reading: mi(11000), category: "repair", laborCostCents: 10000, items: [{ name: "Pump", costCents: 5000 }] }));
await a("POST", `/api/vehicles/${rep}/service`, svc({ date: "2026-03-01", reading: mi(12000), category: "maintenance", laborCostCents: 0, laborHours: 2, items: [{ name: "Oil", costCents: 3000 }] }));
await a("POST", `/api/vehicles/${rep}/fuel`, { date: "2026-03-02", reading: mi(12000), volumeL: 40, costCents: 7000 });
const report = (await a("GET", "/api/reports")).data.find(x => x.vehicleId === rep);
check("service total", report.serviceCents === 18000, report.serviceCents);
check("fuel in total", report.totalCents === 25000, report.totalCents);
check("by category sorted largest first", report.byCategory[0].category === "repair" && report.byCategory[0].cents === 15000, report.byCategory);
check("by year includes fuel", report.byYear.find(y => y.year === "2026").cents === 10000, report.byYear);
check("tracked distance", Math.round(report.tracked / 1609.344) === 2000, report.tracked);
check("labor hours", report.laborHours === 2);
check("reports only cover your vehicles", (await c("GET", "/api/reports")).data.every(x => x.name === "Carol"));
r = await a("GET", `/api/vehicles/${rep}/history`);
check("history has records with items", r.data.service.length === 2 && r.data.service[0].items.length === 1);
r = await c("GET", `/api/vehicles/${rep}/history`);
check("stranger can't read history", r.status === 404);

// ── Export ──
await a("POST", `/api/vehicles/${car}/specs`, { label: "Oil", value: "=HYPERLINK(\"http://evil\")" });
await a("POST", `/api/vehicles/${car}/service`, svc({ title: "=HYPERLINK(\"http://evil\",\"click\")" }));
r = await a("GET", `/api/export?format=csv&today=${today}`);
const csv = new TextDecoder().decode(r.data);
check("CSV export", r.status === 200 && /^vehicle,type,date/.test(csv), csv.slice(0, 60));
check("CSV defuses spreadsheet formulas", csv.includes("'=HYPERLINK") , csv);
check("CSV excludes other people's vehicles", !csv.includes("Bob Car"));
r = await a("GET", `/api/export?format=json&today=${today}`);
check("JSON export", r.data.format === "nitrolog-export" && r.data.vehicles.length >= 2 && r.data.inventory.length >= 1);
check("JSON has no password or secrets", !JSON.stringify(r.data).match(/password|session_secret|\$2[aby]\$/));
r = await a("GET", `/api/export?format=zip&today=${today}`);
check("zip export responds", r.status === 200 && r.headers.get("content-type") === "application/zip", r.status);
const zip = unzipSync(r.data);
const names = Object.keys(zip);
check("zip has the data file", names.includes("nitrolog-export.json"), names);
check("zip data file parses", JSON.parse(strFromU8(zip["nitrolog-export.json"])).format === "nitrolog-export");
const photoEntry = names.find(n => n.endsWith("photo.jpg"));
check("zip has the photo with exact bytes", photoEntry && zip[photoEntry].length === JPEG.length && zip[photoEntry][0] === 0xff, names);
check("zip entries stay inside the archive", names.every(n => !n.includes("..") && !n.startsWith("/")), names);
r = await a("GET", "/api/export?format=exe");
check("unknown export format rejected", r.status === 400);
r = await fetch(`${BASE}/api/export?format=json`);
check("signed-out export refused", r.status === 401);

// ── Build ──
r = await a("POST", `/api/vehicles/${car}/build/stage`, { name: "Stage 1" });
const stage = r.data.id;
check("create stage", r.status === 200);
r = await a("POST", `/api/vehicles/${car}/build/task`, { title: "Install coilovers", stageId: stage, hours: 6 });
const task = r.data.id;
check("create task", r.status === 200, r.data);
await a("PATCH", `/api/build/task/${task}`, { title: "Install coilovers", done: true, hours: 6 });
r = await a("POST", `/api/vehicles/${car}/build/wish`, { name: "Coilovers", url: "https://example.com/x", plannedCents: 100000, actualCents: 95000, status: "bought", stageId: stage });
check("create wishlist item", r.status === 200, r.data);
r = await a("POST", `/api/vehicles/${car}/build/wish`, { name: "Seat", plannedCents: 50000, status: "planned" });
r = await a("POST", `/api/vehicles/${car}/build/wish`, { name: "Bad", url: "javascript:alert(document.cookie)", status: "planned" });
check("javascript: link rejected", r.status === 400, r.status);
r = await a("POST", `/api/vehicles/${car}/build/wish`, { name: "Bad2", url: "data:text/html,<script>1</script>", status: "planned" });
check("data: link rejected", r.status === 400, r.status);
await a("POST", `/api/vehicles/${car}/service`, svc({ title: "Bushings", category: "upgrade", laborCostCents: 20000, laborHours: 3, items: [{ name: "Bushing", costCents: 10000 }] }));
r = await a("GET", `/api/vehicles/${car}/build`);
const t = r.data.totals;
check("wishlist counted separately from planned", t.plannedCents === 150000 && t.wishlistSpentCents === 95000, t);
check("upgrade records count toward the build", t.upgradeCents === 30000 && t.spentCents === 125000, t);
check("hours from tasks and upgrade labor", t.hours === 9, t);
check("task progress", t.tasksDone === 1 && t.tasksTotal === 1, t);
r = await a("POST", `/api/vehicles/${car}/build/log`, { title: "Day one", date: today, body: "Started" });
const log = r.data.id;
r = await upload(a, car, JPEG, "log.jpg", "image/jpeg", { buildLogId: log });
check("photo on build log entry", r.status === 200 && r.data.buildLogId === log, r.data);
r = await a("POST", `/api/vehicles/${car}/build/nope`, {});
check("unknown build type is 404", r.status === 404);
r = await b("POST", `/api/vehicles/${car}/build/stage`, { name: "x" });
check("viewer can't add to build", r.status === 403);
r = await b("GET", `/api/vehicles/${car}/build`);
check("viewer can read build", r.status === 200);
r = await c("PATCH", `/api/build/task/${task}`, { title: "hacked" });
check("stranger can't edit task", r.status === 404);
r = await c("DELETE", `/api/build/stage/${stage}`);
check("stranger can't delete stage", r.status === 404);
r = await b("POST", `/api/vehicles/${bobCar}/build/task`, { title: "x", stageId: stage });
check("can't put a task on another vehicle's stage", r.status === 400, r.status);
const rep2 = (await a("GET", "/api/reports")).data.find(x => x.vehicleId === car);
check("bought wishlist parts reach the report total", rep2.wishlistCents === 95000, rep2.wishlistCents);

// ── Track ──
r = await a("POST", `/api/vehicles/${car}/track`, { date: "2026-05-01", track: "Laguna Seca", conditions: "Dry", setup: "-2 camber", sessions: [
  { name: "S1", laps: 8, bestLapMs: 105000, pressureFl: 220, pressureFr: 220, pressureRl: 210, pressureRr: 210 },
  { name: "S2", laps: 6, bestLapMs: 103500 }] });
check("create track day", r.status === 200, r.data);
const dayId = r.data.id;
await a("POST", `/api/vehicles/${car}/track`, { date: "2026-06-01", track: "Laguna Seca", sessions: [{ bestLapMs: 104000 }] });
await a("POST", `/api/vehicles/${car}/track`, { date: "2026-07-01", track: "Thunderhill", sessions: [] });
r = await a("GET", `/api/vehicles/${car}/track`);
const laguna = r.data.bests.find(x => x.track === "Laguna Seca");
check("best lap is the lowest across visits", laguna.bestLapMs === 103500 && laguna.visits === 2, r.data.bests);
check("track with no laps shows none", r.data.bests.find(x => x.track === "Thunderhill").bestLapMs === null);
check("newest day first with sessions", r.data.days[2].sessions.length === 2 && r.data.days[0].track === "Thunderhill");
r = await a("POST", `/api/vehicles/${car}/track`, { date: today, track: "x", sessions: [{ bestLapMs: 1.5 }] });
check("non-integer lap rejected", r.status === 400);
r = await a("PATCH", `/api/track/${dayId}`, { date: "2026-05-01", track: "Laguna Seca", sessions: [{ bestLapMs: 99000 }] });
r = await a("GET", `/api/vehicles/${car}/track`);
check("editing replaces sessions and updates best", r.data.bests.find(x => x.track === "Laguna Seca").bestLapMs === 99000);
r = await c("DELETE", `/api/track/${dayId}`);
check("stranger can't delete track day", r.status === 404);
r = await b("PATCH", `/api/track/${dayId}`, { date: today, track: "x" });
check("viewer can't edit track day", r.status === 403);

// ── Push ──
r = await a("GET", "/api/push");
check("public key served", r.status === 200 && r.data.publicKey.length > 40 && !r.data.privateKey, r.data);
const key1 = r.data.publicKey;
check("key is stable", (await a("GET", "/api/push")).data.publicKey === key1);
const keys = { p256dh: "abc", auth: "def" };
for (const endpoint of ["http://fcm.googleapis.com/x", "https://localhost:7100/api/me", "https://192.168.1.1/admin", "https://169.254.169.254/latest/meta-data", "https://fcm.googleapis.com.evil.example/x", "https://evil.example/fcm.googleapis.com/x", "file:///etc/passwd"]) {
  r = await a("POST", "/api/push", { endpoint, keys });
  check(`push endpoint refused: ${endpoint}`, r.status === 400, r.status);
}
r = await a("POST", "/api/push", { endpoint: "https://fcm.googleapis.com/fcm/send/fake", keys });
check("real push service accepted", r.status === 200, r.data);
check("device counted", (await a("GET", "/api/push")).data.devices === 1);
await a("POST", "/api/push/unsubscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/fake" });
check("device removed", (await a("GET", "/api/push")).data.devices === 0);
r = await a("POST", "/api/push/test");
check("test with no devices fails clearly", r.status === 502, r.status);
r = await fetch(`${BASE}/api/push`);
check("signed-out push key refused", r.status === 401);

// ── Import ──
const imp = (await a("POST", "/api/vehicles", { kind: "car", name: "Import Car", today, templates: [] })).data.id;
const rows = [
  { date: "2024-01-01", title: "Oil", reading: mi(1000), costCents: 4000, category: "maintenance" },
  { date: "2024-06-01", title: "Brakes", reading: mi(2000), costCents: 30000, category: "repair", notes: "Front" },
];
r = await a("POST", `/api/vehicles/${imp}/import`, { type: "service", rows });
check("import adds rows", r.data.added === 2 && r.data.skipped === 0, r.data);
r = await a("POST", `/api/vehicles/${imp}/import`, { type: "service", rows: [...rows, { date: "2025-01-01", title: "New", costCents: 0 }] });
check("re-import only adds new rows", r.data.added === 1 && r.data.skipped === 2, r.data);
r = await a("GET", `/api/vehicles/${imp}/service`);
check("import keeps cost in totals", r.data.find(s => s.title === "Brakes").totalCents === 30000, r.data);
r = await a("POST", `/api/vehicles/${imp}/import`, { type: "fuel", rows: [{ date: "2024-01-02", reading: mi(1100), volumeL: 40, costCents: 5000 }] });
check("fuel import", r.data.added === 1, r.data);
r = await a("POST", `/api/vehicles/${imp}/import`, { type: "service", rows: [{ date: "2024-02-02", title: "Good" }, { date: "nope", title: "Bad" }] });
check("a bad row fails with its row number", r.status === 400 && /row 2/.test(r.data.message), r.data);
r = await a("GET", `/api/vehicles/${imp}/service`);
check("a failed import saves nothing", !r.data.some(s => s.title === "Good"), r.data.length);
r = await b("POST", `/api/vehicles/${imp}/import`, { type: "service", rows });
check("stranger can't import", r.status === 404);
r = await a("POST", `/api/vehicles/${imp}/import`, { type: "service", rows: [] });
check("empty import refused", r.status === 400);

// Deleting a vehicle takes its files with it (checked from outside by the runner too).
const del = (await a("POST", "/api/vehicles", { kind: "other", name: "Delete me", today })).data.id;
const delFile = (await upload(a, del, JPEG, "gone.jpg", "image/jpeg")).data.id;
r = await a("DELETE", `/api/vehicles/${del}`);
check("vehicle deleted", r.status === 200);
check("its file record is gone", (await a("GET", `/api/attachments/${delFile}/file`)).status === 404);
const carolVehicle = (await c("GET", "/api/vehicles")).data[0].id;
await upload(c, carolVehicle, JPEG, "carol.jpg", "image/jpeg");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
