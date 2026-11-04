# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # http://localhost:7100
npm run build
npm run typecheck
npm test           # pure logic only: due dates, fuel, units, CSV, laps, push rules
docker build -t rayderc/nitrolog:latest .
node scripts/e2e-core.mjs http://localhost:7100      # full API checks; each needs a new database
node scripts/e2e-features.mjs http://localhost:7100
```

Set `DATABASE_PATH` to a scratch file when running locally so you don't touch real data.

## Product rules

- The home screen answers "what's due?" across all vehicles. Everything else is one step away.
- Fuel is optional and stays inside the vehicle page. The owner doesn't track gas, so don't add it to the home screen or make anything depend on it.
- No gamification.
- Parts inventory belongs to one user, even when a part is earmarked for a shared vehicle. Editors can only draw from their own shelf.
- Admins manage accounts and never get access to other people's vehicles.

## Architecture

Next.js App Router, one Docker container, SQLite. All UI is `"use client"` and fetches from `app/api/**/route.ts`. It runs on the public internet through a Cloudflare Tunnel, so treat every route as exposed.

- **Auth**: `proxy.ts` redirects signed-out page requests to `/login`. API routes are excluded from it and check auth through `route()`. Sessions carry `token_version`, and bumping it (`setPassword`) signs out that user's other sessions.
- **API**: every handler except login, logout and setup uses `route()` from `lib/api.ts`, which handles auth, the CSRF origin check, JSON parsing, errors and `{ admin: true }`. Throw `bad()`, `notFound()` or `HttpError` to return an error.
- **Access**: `requireVehicle(userId, vehicleId, need)` in `lib/repo/vehicles.ts` is the only way in to a vehicle's data. No access returns 404; too little access returns 403. Every child record (service, schedule, spec, fuel, reading) finds its vehicle and calls this before reading or writing. Admins get no bypass: admin manages accounts, not vehicles.
- **Client IP**: use `clientIp()`. It prefers `CF-Connecting-IP`. Don't trust the leftmost `X-Forwarded-For`, which clients control.
- **Database**: `lib/db.ts` opens the DB on first use, never on import, because `next build` imports every route in parallel workers. Don't query at module level. Schema changes go in as a new entry in its `MIGRATIONS` array, never by editing `SCHEMA_V1`.
- **Client vs server code**: anything importing `lib/db.ts` is server-only, so pages can't import `lib/repo/*`. Shared shapes live in `lib/types.ts`. `lib/due.ts`, `lib/fuel.ts`, `lib/units.ts`, `lib/lap.ts`, `lib/csv.ts`, `lib/pushLogic.ts` and `lib/templates.ts` are safe on both sides. Tested ones have no path-alias imports so `node --test` can run them directly.
- **Uploads**: `lib/files.ts` decides a file's type from its first bytes, never from its name or the browser's claim. Only images and PDFs are allowed, because SVG and HTML can run script. Stored names are random. Files are private and served through `/api/attachments/[id]/file`, never `public/`. The database cascade can't delete files, so call `storedNamesForVehicles` before deleting vehicles.
- **Links**: anything rendered as an `href` must be limited to `http:` and `https:`, as `link()` in `lib/repo/builds.ts` does, or a `javascript:` URL runs as whoever clicks it.
- **Push**: `lib/push.ts` only stores endpoints on known browser push services. The server sends requests to stored endpoints, so without that allowlist any user could make it call your home network. `instrumentation.ts` starts the hourly check. `decidePush` in `lib/pushLogic.ts` makes repeat runs safe.

## Derived values

These are worked out when read rather than stored, so editing or deleting a record corrects them without any sync code. Don't add columns that cache them.

- **Current reading**: `currentReading()` is the highest reading across `odometer_readings`, `service_records` and `fuel_logs`. A typo is fixed by editing or deleting its source, which is why a lower manual reading is rejected with an explanation.
- **Last done**: a schedule item's last date and reading are the latest of its `base_*` values and any service record linked through `service_tasks`. `base_*` is the starting point the user gave.
- **Due status**: `computeDue()` in `lib/due.ts`. Either limit passing makes it overdue. "Soon" means the last 10% of the reading interval or the last 30 days.
- **Fuel economy**: `computeEconomy()` in `lib/fuel.ts`, fill-to-fill. Partial fills add to the next full tank.
- **Parts on hand**: `stock_in` minus what `service_items` used, so editing or deleting a record restores stock. Setting on-hand in the parts form adds past use back into `stock_in`.
- **Build invested**: bought wishlist parts plus service records in the `upgrade` category. A part logged in both counts twice, and the Build tab says so.

## Units and time

This is the rule most likely to cause data bugs:

- **Stored**: readings are meters on distance vehicles and hours on hour-metered ones, fuel is liters, money is whole cents, tire pressure is kPa, lap times are milliseconds. Timestamps are ISO-8601 UTC with a `Z`.
- **Displayed**: convert only at display and input time with `lib/units.ts`. Units are per-user. Currency is per-vehicle with no conversion, because people sharing a vehicle must see the same amounts.
- **`meter_type` is fixed at creation**: changing it would change what every stored reading means.
- **Days**: dates like `service_records.date` are bare `YYYY-MM-DD`. Pass `?today=` from `localDay()` on anything that depends on "today", and format with `fmtDate`, which avoids showing the previous day west of UTC.

## Design system

Cyberpunk dark theme in `app/globals.css`, consistent with AstroFit, Amethyst, ComicOrbit and SkyBit: purple/cyan/magenta, grid and scanline backdrop, circuit background. Add new styles to the "NitroLog additions" section at the end. The file still contains unused rules from AstroFit's base, which are safe to remove when working nearby.

Body text uses system fonts. `var(--font-mono)` (JetBrains Mono) is only for labels, badges, stat values and form labels. Branding is text-only.

Mobile breakpoints: 900px (sidebar becomes a drawer, bottom tab bar appears) and 640px (inputs get `font-size: 16px` to prevent iOS zoom, modals become bottom sheets).

## PWA

`public/sw.js` is network-first and never caches `/api`. It's only registered in production builds. Bump `CACHE` when changing what it precaches. Icons in `public/icons/` are committed PNGs from `scripts/make-icons.mjs`.

## Docker

- `.dockerignore` must exclude `node_modules`, or Windows binaries overwrite the Linux SQLite build.
- `.gitattributes` forces LF on `*.sh` and `Dockerfile`.
- `docker-entrypoint.sh` starts as root only to chown `/config`, because bind mounts are usually root-owned, then re-runs itself as the `node` user with `setpriv`. Don't add a `USER` line to the Dockerfile, or bind mounts fail with "Permission denied".
- `docker-entrypoint.sh` generates `SESSION_SECRET` into `/config/.session_secret` when it isn't set.
- Publish like the owner's other apps: `docker build -t rayderc/nitrolog:latest .` then `docker push rayderc/nitrolog:latest`. The image is `linux/amd64` only.
