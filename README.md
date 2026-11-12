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
- **Quick part entry**: typing a part suggests ones you've used before and ones on your shelf, with what you paid. Ticking a schedule item offers last time's parts in one tap. Or paste a link to the product from almost any store, and it adds the part with its name, brand, part number and price. Stores that refuse apps (AutoZone, O'Reilly, eBay without keys) fill in what the link itself says, and you type the price. With a Gemini key set, NitroLog asks Gemini to read those pages instead, and uses its answer only when Google reports it really opened the page. The link is saved with the part, so you can open the store page again from the record. The Parts page takes a link the same way.
- **Receipts kept**: a picture read for parts is saved to the service record as a receipt, unless you untick it.
- **Safety recalls**: once a week NitroLog checks NHTSA's free recall list for each vehicle's year, make and model. Open recalls sit in one collapsed line at the bottom of the vehicle's page, where you can mark them fixed, hide one, or hide them all. Recall alerts are off unless you turn them on in Settings, and then only a recall that's new since the last check alerts, once.
- **Price-drop alerts** (off until you turn them on in Settings): tick **Watch price** on a part with a store link (on the Parts page or a service record; ticking it turns the alerts on), and once a day NitroLog checks it and tells you when it drops at least 5%.
- **Mods in the build log**: a service record in the Upgrade / mod category adds itself to the Build tab's log with its parts, and you can note power before and after. The Build tab shows where the car started and where it is now.
- **Admin**: rename people, reset passwords, make admins, disable, sign out of every device, or delete accounts. The Admin page also says when a newer version is on Docker Hub (it checks once a day and sends nothing about you), and has backups. Deleting someone asks who gets each of their vehicles, or whether to delete it. The Admin page lists every vehicle on the server and can change a vehicle's owner.
- **Read a screenshot or receipt** (optional): pick a screenshot of a product page or an order, or a photo of a receipt, and every part on it goes in with its price. You can also paste a picture straight into the link box, or tap **Paste picture**. Uses Google's Gemini API, which has a free tier. See below.
- **Send to NitroLog**: a bookmark (set up under Settings) that you tap on any store's product page. It reads that page in your own browser, price included, and opens a new service record with the part filled in.
- **Part prices** (optional): current eBay prices for a part, matched to your vehicle where eBay knows the fit, plus quick searches on RockAuto, AutoZone, Amazon and Google Shopping.
- **Schedules**: editable starter schedules for cars, motorcycles, powersports and track cars. Logging a service resets the items it covers.
- **Specs**: oil types, torque values, filter numbers and how-to notes for each vehicle. **Fluid capacities** fills in oil, coolant, transmission, differentials and more on one sheet, and they show on the service form while you log.
- **Paperwork**: registration, insurance, inspection and emissions presets on the schedule. Pick when it's next due and it shows on Due a month before, with a notification if you have them on.
- **Sign-ins**: Settings lists your recent sign-ins and wrong-password tries, and can sign out every other device.
- **Odometer or hours**: any service or fill-up updates the reading, and there's a one-tap update as well.
- **Fuel log** (optional): fill-ups with fuel economy, tucked inside each vehicle.
- **VIN lookup**: optional decode through the free NHTSA database, which mainly covers US-market vehicles. You can always type details in.
- **Parts page**: opens on **Used before**, every part and fluid you've logged, grouped as one entry per part with how often you used it, what it last cost, what you've spent, which vehicles, and its store link. Search it, filter by vehicle, parts or fluids, watched or linked, and sort by recent, most used, name, spent or price. The filters are remembered on each device.
- **On the shelf** (second tab on the Parts page): spare parts and fluids with part numbers, locations and low-stock warnings, for anyone who keeps stock. Using one on a service takes it out of stock, and editing or deleting that record puts it back.
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

You can set them as `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` on the container instead, and then the Admin page shows them as set there. Amazon has no price API a personal app can use, so it's offered as a search link. The same keys let a pasted eBay listing link fill in its title, brand, part number and price, since eBay doesn't let apps read its pages.

### Reading screenshots and receipts (optional)

**Read a screenshot or receipt** under the link box sends the picture to Google's Gemini API, which lists the parts and prices in it. An admin pastes a free key under **Admin → Optional services**, which has a guide; get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) without adding a card. NitroLog doesn't keep the pictures. On Gemini's free tier Google may use what you send to improve its products, so crop out anything private first. `GEMINI_API_KEY` on the container works too, and `GEMINI_MODEL` picks the model (default `gemini-flash-lite-latest`).

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
| `GEMINI_API_KEY` | unset | Optional. Google Gemini key for reading screenshots and receipts. Usually set on the Admin page instead |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` | Optional. The Gemini model that reads pictures |

## Backups

NitroLog copies its database every night into `/config/backups` and keeps the last 7. On **Admin → Backups** you can save a copy now, **Download backup** (one `.tar` with the database and every photo and document), and restore from a downloaded file or any saved copy. Restoring checks the file first and saves a copy of what's there now, so a restore can be undone the same way. Keep a downloaded backup somewhere other than the server now and then, since the nightly copies live on the same disk. `BACKUP_DIR` moves them.

**Settings → Export** gives you your data in readable form, but it can't be loaded back in. You can also copy the whole volume while the container is stopped:

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
