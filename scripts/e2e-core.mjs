// Checks accounts, vehicles, service, schedules and permissions against a fresh server:
//   node scripts/e2e-core.mjs http://localhost:7100
const BASE = process.argv[2];
let passed = 0, failed = 0;
const today = new Date().toISOString().slice(0, 10);

function client() {
  let cookie = "";
  return async (method, path, body, headers = {}) => {
    const res = await fetch(BASE + path, {
      method, redirect: "manual",
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data, setCookie: set, headers: res.headers };
  };
}
function check(name, ok, extra) {
  if (ok) { passed++; console.log("  ok  ", name); }
  else { failed++; console.log("  FAIL", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

const admin = client(), bob = client(), eve = client(), anon = client();
const PW = "correct-horse-battery";

let r = await anon("GET", "/");
check("signed-out page redirects to login", r.status === 307 && r.headers.get("location").includes("/login"), r.status);
r = await anon("GET", "/api/vehicles");
check("signed-out API is 401", r.status === 401);
r = await anon("GET", "/api/setup");
check("fresh server needs setup", r.data.needsSetup === true);
r = await anon("POST", "/api/setup", { username: "x", password: "short" });
check("setup rejects a weak account", r.status === 400);
r = await admin("POST", "/api/setup", { username: "Admin", password: PW, distanceUnit: "mi", volumeUnit: "gal" }, { Origin: "https://evil.example", Host: "nitrolog.example" });
check("setup rejects a cross-site origin", r.status === 403);
r = await admin("POST", "/api/setup", { username: "Admin", password: PW, distanceUnit: "mi", volumeUnit: "gal" });
check("setup creates the admin", r.status === 200, r.data);
check("session cookie is HttpOnly and Secure", /HttpOnly/i.test(r.setCookie) && /Secure/i.test(r.setCookie), r.setCookie);
r = await anon("POST", "/api/setup", { username: "second", password: PW });
check("setup can't run twice", r.status === 403);

r = await admin("POST", "/api/admin/users", { username: "bob", password: PW });
check("admin creates bob", r.status === 200, r.data);
const bobId = r.data.id;
r = await admin("POST", "/api/admin/users", { username: "eve", password: PW });
const eveId = r.data.id;
r = await bob("GET", "/api/admin/users");
check("non-signed-in bob can't list users", r.status === 401);
r = await bob("POST", "/api/login", { username: "bob", password: "wrong-password" });
check("wrong password rejected", r.status === 401);
r = await bob("POST", "/api/login", { username: "bob", password: PW });
check("bob signs in", r.status === 200);
await eve("POST", "/api/login", { username: "eve", password: PW });
r = await bob("GET", "/api/admin/users");
check("non-admin can't use admin API", r.status === 403);

// Vehicle with a template. 50,000 mi in meters.
const mi = n => n * 1609.344;
r = await admin("POST", "/api/vehicles", { kind: "car", year: 2015, make: "Subaru", model: "WRX", today, reading: mi(50000), meterType: "distance", currency: "USD", templates: ["Engine oil & filter", "Brake fluid"] });
check("create vehicle", r.status === 200, r.data);
const carId = r.data.id;
r = await admin("GET", `/api/vehicles/${carId}`);
check("name falls back to year make model", r.data.vehicle.name === "2015 Subaru WRX", r.data.vehicle.name);
check("current reading comes from the first reading", Math.round(r.data.vehicle.reading / 1609.344) === 50000);
r = await admin("GET", `/api/vehicles/${carId}/schedule?today=${today}`);
check("starter items added, only those picked", r.data.length === 2, r.data.length);
const oil = r.data.find(i => i.name === "Engine oil & filter");
check("oil starts ok with 5000 mi left", oil.status === "ok" && Math.round(oil.remaining / 1609.344) === 5000, oil);

// Drive past the interval.
r = await admin("POST", `/api/vehicles/${carId}/readings`, { reading: mi(55100), date: today });
check("manual reading accepted", r.status === 200, r.data);
r = await admin("GET", `/api/due?today=${today}`);
check("oil now overdue on the home screen", r.data.items.find(i => i.id === oil.id).status === "overdue");
check("overdue sorts first", r.data.items[0].id === oil.id);
r = await admin("POST", `/api/vehicles/${carId}/readings`, { reading: mi(100), date: today });
check("lower manual reading explained, not ignored", r.status === 400 && /lower/.test(r.data.message), r.data);

// Log the service.
const svc = { date: today, reading: mi(55100), title: "Oil change", category: "maintenance", laborHours: 0.5, laborCostCents: 2000, notes: "Used 5W-30",
  scheduleIds: [oil.id], items: [{ kind: "fluid", name: "5W-30", brand: "Motul", quantity: 5, unit: "qt", costCents: 4500 }, { kind: "part", name: "Filter", partNumber: "15208AA15A", costCents: 1200 }] };
r = await admin("POST", `/api/vehicles/${carId}/service`, svc);
check("service logged", r.status === 200, r.data);
const svcId = r.data.id;
r = await admin("GET", `/api/due?today=${today}`);
let item = r.data.items.find(i => i.id === oil.id);
check("logging resets the schedule item", item.status === "ok" && Math.round(item.remaining / 1609.344) === 5000, item);
r = await admin("GET", `/api/vehicles/${carId}/service`);
check("total = parts + labor", r.data[0].totalCents === 7700, r.data[0]);
check("records who logged it", r.data[0].loggedBy === "admin");
r = await admin("GET", `/api/service/${svcId}`);
check("detail returns items and tasks", r.data.items.length === 2 && r.data.scheduleIds[0] === oil.id, r.data);
r = await admin("PATCH", `/api/service/${svcId}`, { ...svc, items: [svc.items[0]], title: "Oil change (edited)" });
check("service edit", r.status === 200, r.data);
r = await admin("GET", `/api/service/${svcId}`);
check("edit replaces items", r.data.items.length === 1 && r.data.title === "Oil change (edited)");
r = await admin("DELETE", `/api/service/${svcId}`);
r = await admin("GET", `/api/due?today=${today}`);
check("deleting the record makes it overdue again", r.data.items.find(i => i.id === oil.id).status === "overdue");
await admin("POST", `/api/vehicles/${carId}/service`, svc);

// Permissions.
r = await eve("GET", `/api/vehicles/${carId}`);
check("stranger gets 404 on vehicle", r.status === 404, r.status);
r = await eve("GET", `/api/vehicles/${carId}/service`);
check("stranger gets 404 on service list", r.status === 404, r.status);
r = await eve("PATCH", `/api/schedule/${oil.id}`, { name: "x", intervalMonths: 1, baseDate: today });
check("stranger can't edit schedule", r.status === 404, r.status);
r = await eve("POST", `/api/vehicles/${carId}/members`, { username: "eve", role: "editor" });
check("stranger can't add themselves", r.status === 404, r.status);

r = await admin("POST", `/api/vehicles/${carId}/members`, { username: "bob", role: "viewer" });
check("owner shares as viewer", r.status === 200, r.data);
r = await admin("POST", `/api/vehicles/${carId}/members`, { username: "ghost", role: "viewer" });
check("sharing with unknown user fails clearly", r.status === 404);
r = await bob("GET", `/api/vehicles/${carId}`);
check("viewer can read", r.status === 200 && r.data.vehicle.role === "viewer");
r = await bob("POST", `/api/vehicles/${carId}/service`, svc);
check("viewer can't log service", r.status === 403, r.status);
r = await bob("PATCH", `/api/vehicles/${carId}`, { name: "hacked" });
check("viewer can't edit vehicle", r.status === 403);
r = await bob("GET", `/api/vehicles/${carId}/members`);
check("viewer can't see members", r.status === 403);
r = await admin("PATCH", `/api/vehicles/${carId}/members/${bobId}`, { role: "editor" });
check("owner promotes to editor", r.status === 200);
r = await bob("POST", `/api/vehicles/${carId}/specs`, { label: "Oil type", value: "5W-30", notes: "Drain plug 30 ft-lb" });
check("editor can add spec", r.status === 200, r.data);
const specId = r.data.id;
r = await bob("DELETE", `/api/vehicles/${carId}`);
check("editor can't delete vehicle", r.status === 403);
r = await eve("DELETE", `/api/specs/${specId}`);
check("stranger can't delete spec", r.status === 404);

// A schedule id from another vehicle must not reset that vehicle.
r = await eve("POST", "/api/vehicles", { kind: "other", name: "Eve car", today });
const eveCar = r.data.id;
r = await eve("POST", `/api/vehicles/${eveCar}/service`, { ...svc, scheduleIds: [oil.id] });
check("foreign schedule id rejected", r.status === 400, r);
r = await eve("GET", `/api/vehicles/${eveCar}/service`);
check("rejected service left nothing behind", r.data.length === 0, r.data);

// Validation.
r = await admin("POST", `/api/vehicles/${carId}/service`, { ...svc, date: "2026-02-31" });
check("impossible date rejected", r.status === 400);
r = await admin("POST", `/api/vehicles/${carId}/service`, { ...svc, reading: -5 });
check("negative reading rejected", r.status === 400);
r = await admin("POST", `/api/vehicles/${carId}/service`, { ...svc, category: "nope" });
check("unknown category rejected", r.status === 400);
r = await admin("POST", `/api/vehicles/${carId}/schedule`, { name: "No limit", baseDate: today });
check("schedule needs an interval", r.status === 400);
r = await admin("GET", "/api/vin/abc");
check("bad VIN rejected before any outside call", r.status === 400);
r = await admin("GET", `/api/vehicles/${encodeURIComponent("1 OR 1=1")}`);
check("non-numeric id rejected", r.status === 400);

// Hours vehicle and fuel.
r = await admin("POST", "/api/vehicles", { kind: "powersports", name: "ATV", meterType: "hours", reading: 100, today, templates: ["Engine oil & filter"] });
const atv = r.data.id;
r = await admin("GET", `/api/vehicles/${atv}/schedule?today=${today}`);
check("hours vehicle gets an hours interval", r.data[0].intervalReading === 50 && r.data[0].remaining === 50, r.data[0]);
await admin("POST", `/api/vehicles/${carId}/fuel`, { date: today, reading: mi(55200), volumeL: 40 });
r = await admin("POST", `/api/vehicles/${carId}/fuel`, { date: today, reading: mi(55500), volumeL: 40 });
check("fuel log saved", r.status === 200, r.data);
r = await admin("GET", `/api/vehicles/${carId}/fuel`);
check("fuel economy computed", Math.abs(r.data.average - mi(300) / 40) < 1e-6, r.data.average);
r = await admin("GET", `/api/vehicles/${carId}`);
check("fill-up moves the current reading", Math.round(r.data.vehicle.reading / 1609.344) === 55500);

// Security behaviour.
r = await admin("POST", `/api/vehicles/${carId}/readings`, { reading: mi(60000), date: today }, { Origin: "https://evil.example" });
check("cross-site write blocked", r.status === 403, r.status);
r = await bob("POST", "/api/me/password", { current: "wrong", next: "another-password-1" });
check("password change needs current password", r.status === 403);
const bob2 = client();
await bob2("POST", "/api/login", { username: "bob", password: PW });
r = await bob("POST", "/api/me/password", { current: PW, next: "another-password-1" });
check("password changed", r.status === 200, r.data);
r = await bob("GET", "/api/me");
check("this device stays signed in", r.status === 200, r.status);
r = await bob2("GET", "/api/me");
check("other device is signed out", r.status === 401, r.status);

// Deleting an owner passes shared vehicles on.
r = await admin("POST", "/api/vehicles", { kind: "other", name: "Shared by eve", today });
r = await eve("POST", "/api/vehicles", { kind: "other", name: "Eve shared", today });
const shared = r.data.id;
await eve("POST", `/api/vehicles/${shared}/members`, { username: "bob", role: "viewer" });
r = await admin("DELETE", `/api/admin/users/${eveId}`);
check("admin deletes eve", r.status === 200, r.data);
r = await bob("GET", `/api/vehicles/${shared}`);
check("shared vehicle passes to the remaining member", r.status === 200 && r.data.vehicle.role === "owner", r.data);
r = await eve("GET", "/api/me");
check("deleted user is signed out", r.status === 401);
r = await admin("DELETE", `/api/admin/users/1`);
check("can't delete yourself", r.status === 400);

// Rate limit can't be dodged with a spoofed header.
const spam = client();
let last;
for (let i = 0; i < 12; i++) last = await spam("POST", "/api/login", { username: "nobody", password: "wrong" }, { "X-Forwarded-For": `10.0.0.${i}, 203.0.113.9` });
check("login rate limit ignores spoofed X-Forwarded-For", last.status === 429, last.status);

r = await anon("GET", "/manifest.webmanifest");
check("manifest is served", r.status === 200 && r.data.name === "NitroLog");
const icon = await fetch(`${BASE}/icons/icon-192.png`);
check("icon is served without login", icon.status === 200);
const page = await fetch(`${BASE}/login`);
check("CSP has no unsafe-eval in production", !/unsafe-eval/.test(page.headers.get("content-security-policy") ?? "unsafe-eval"), page.headers.get("content-security-policy"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
