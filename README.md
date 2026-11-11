# NitroLog

Self-hosted maintenance tracker for cars, motorcycles, powersports, and project or track vehicles. It shows what's due across your whole garage, reminds you on your phone, keeps the full history for each vehicle, tracks builds and track days, and lets you share vehicles with other people. Built with Next.js and SQLite, it runs in a single Docker container.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![SQLite](https://img.shields.io/badge/SQLite-WAL-green?logo=sqlite)
![Docker](https://img.shields.io/badge/Docker-ready-blue?logo=docker)
![Port](https://img.shields.io/badge/port-7100-purple)

## Features

- **What's due**: overdue and upcoming service across every vehicle, by distance, engine hours or time, whichever comes first.
- **Service records**: date, reading, parts and fluids with part numbers and costs, labor hours and cost, and notes.
- **Quick part entry**: typing a part suggests ones you've used before and ones on your shelf, with what you paid. Ticking a schedule item offers last time's parts in one tap. Or paste an Amazon, AutoZone or O'Reilly product link and it fills in the name, brand and part number from the link.
- **Part prices** (optional): current eBay prices for a part, matched to your vehicle where eBay knows the fit, plus quick searches on RockAuto, AutoZone, Amazon and Google Shopping.
- **Schedules**: editable starter schedules for cars, motorcycles, powersports and track cars. Logging a service resets the items it covers.
- **Specs**: oil types, torque values, filter numbers and how-to notes for each vehicle.
- **Odometer or hours**: any service or fill-up updates the reading, and there's a one-tap update as well.
- **Fuel log** (optional): fill-ups with fuel economy, tucked inside each vehicle.
- **VIN lookup**: optional decode through the free NHTSA database, which mainly covers US-market vehicles. You can always type details in.
- **Parts inventory**: spare parts and fluids with part numbers, locations and low-stock warnings. Using one on a service takes it out of stock, and editing or deleting that record puts it back.
- **Documents and photos**: receipts, insurance, registration and photos, on the vehicle or on a service record, up to 25 MB each.
- **Reports**: spend by category and year, total cost, and cost per mile, km or hour.
- **Printable history**: a clean service record for a vehicle, ready to print or save as a PDF when you sell it.
- **Builds**: stages with checklists, a wishlist with planned against actual prices, a dated photo log, and total money and hours invested.
- **Track days**: sessions, lap times, tire pressures and setups, with your best lap at each track.
- **Reminders**: phone push notifications when service is due soon or overdue.
- **Your data**: CSV import with column matching and a preview, plus export as CSV, JSON, or a zip that includes your files.
- **Sharing**: each vehicle has an owner, who can add other users as editors or viewers.
- **Units**: per-user mi/km and gal/L, psi or kPa to match, with currency set per vehicle.
- **Installable**: works as a PWA on your phone.

The starter schedules are generic starting points, not factory data. Check your owner's manual and adjust them.

## Quick start

```bash
docker run -d \
  --name nitrolog \
  -p 7100:7100 \
  -v nitrolog_data:/config \
  --restart unless-stopped \
  rayderc/nitrolog:latest
```

Open **http://localhost:7100** and create the admin account.

You can sign in over plain HTTP on your own network, or over HTTPS through a reverse proxy or tunnel. If you only ever use HTTPS, set `SESSION_COOKIE_SECURE=true` so the session cookie is never sent unencrypted.

## Portainer and Cloudflare Tunnel

1. In Portainer, go to **Stacks → Add stack** and paste [docker-compose.yml](docker-compose.yml).
2. Open NitroLog at `http://<host-ip>:7100` and **create the admin account before you publish it**. Until an admin exists, whoever reaches `/setup` first becomes the admin.
3. Add a public hostname to your Cloudflare Tunnel pointing to `http://<host-ip>:7100`, or `http://nitrolog:7100` if `cloudflared` shares a Docker network with the container.

A named volume or a bind mount to a folder on a local Linux disk both work. SQLite's WAL locking can break on network shares and Windows bind mounts. On startup the container gives the data folder to its unprivileged user (UID 1000), then runs the app as that user.

## Phone notifications

Notifications need HTTPS, which a Cloudflare Tunnel provides. Turn them on under **Settings → Service reminders** on each device. On iPhone, add NitroLog to your Home Screen first and turn them on from there.

You get one notification when something becomes due soon, one when it becomes overdue, and a reminder every 14 days while it stays overdue. NitroLog checks every hour.

## Part prices from eBay

The service form's **Check prices** shows current eBay listings for a part when NitroLog has an eBay keyset. Keys are free. An admin sets them up under **Admin → Optional services**, which has a step-by-step guide and a Test button. In short:

1. Sign up at [developer.ebay.com](https://developer.ebay.com/) and create an application keyset in the **Production** column.
2. Paste the App ID (Client ID) and Cert ID (Client Secret) into the Admin page and tap Save, then Test.

You can set them as `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` on the container instead, and then the Admin page shows them as set there. Amazon has no price API a personal app can use, so it's offered as a search link.

Without keys, the store search links still work. Each lookup is cached for 30 minutes, and each person can do 30 a minute, which keeps well inside eBay's free daily allowance.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_PATH` | `/config/nitrolog.db` | SQLite database path |
| `SESSION_SECRET` | generated | Cookie encryption secret, at least 32 characters. If unset, one is generated and saved to `/config/.session_secret` |
| `SESSION_COOKIE_SECURE` | `false` | Set to `true` when you only serve over HTTPS |
| `PORT` | `7100` | Listening port |
| `UPLOAD_DIR` | `/config/uploads` | Where photos and documents are stored |
| `PUSH_CONTACT` | project URL | `mailto:` or `https:` contact sent to push services |
| `EBAY_CLIENT_ID` | unset | Optional. eBay Production App ID, for part prices. Usually set on the Admin page instead |
| `EBAY_CLIENT_SECRET` | unset | Optional. eBay Production Cert ID. Usually set on the Admin page instead |

## Backups

Everything lives in the `/config` volume, including photos and documents. **Settings → Export** gives you your data in readable form, but NitroLog can't load an export back in, so use this volume copy for backups you may need to restore. To copy it while the container is stopped:

```bash
docker run --rm -v nitrolog_data:/config -v "$PWD":/backup debian:bookworm-slim \
  tar czf /backup/nitrolog-backup.tar.gz -C /config .
```

## Running from source

```bash
git clone https://github.com/RayderC/NitroLog.git
cd NitroLog
npm install
npm run dev       # http://localhost:7100
npm test
```

With a fresh server running, these exercise the whole API, including permissions and hostile input:

```bash
node scripts/e2e-core.mjs http://localhost:7100      # on a new database
node scripts/e2e-features.mjs http://localhost:7100  # on another new database
```

Without `DATABASE_PATH`, the database is created as `nitrolog.db` in the project folder.

## Building the image

```bash
docker build -t rayderc/nitrolog:latest .
docker push rayderc/nitrolog:latest
```

## Tech stack

Next.js 16 (App Router), React 19, TypeScript, SQLite via better-sqlite3 (WAL mode), iron-session, web-push, fflate and pure CSS.

## License

MIT
