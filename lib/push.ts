import webpush from "web-push";
import { bad, requiredText } from "./api";
import { db } from "./db";
import { decidePush, pushMessage, type PushItem, type PushSent } from "./pushLogic";
import { dueAcross } from "./repo/schedule";

type Keys = { publicKey: string; privateKey: string };

/** Generated once and kept in the database. Changing them would invalidate every phone's subscription. */
function vapidKeys(): Keys {
  return db.transaction(() => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'vapid'").get() as { value: string } | undefined;
    if (row) return JSON.parse(row.value) as Keys;
    const keys = webpush.generateVAPIDKeys();
    db.prepare("INSERT INTO settings (key, value) VALUES ('vapid', ?)").run(JSON.stringify(keys));
    return keys;
  }).immediate();
}

export const pushPublicKey = () => vapidKeys().publicKey;

/**
 * The server sends requests to whatever endpoint is stored, so only real browser push services are accepted.
 * Without this, any signed-in user could make the server call addresses on your home network.
 */
const PUSH_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"];

function pushEndpoint(v: unknown): string {
  const raw = requiredText(v, "Endpoint", 2000);
  let u: URL;
  try { u = new URL(raw); } catch { throw bad("Invalid push endpoint"); }
  const known = PUSH_HOSTS.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`));
  if (u.protocol !== "https:" || !known) throw bad("That browser's push service isn't supported");
  return raw;
}

export function subscribe(userId: number, b: any) {
  const endpoint = pushEndpoint(b?.endpoint);
  const p256dh = requiredText(b?.keys?.p256dh, "Key", 300);
  const auth = requiredText(b?.keys?.auth, "Key", 300);
  db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
    ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`).run(userId, endpoint, p256dh, auth);
}

export function unsubscribe(userId: number, endpoint: unknown) {
  db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").run(userId, String(endpoint ?? ""));
}

export const subscriptionCount = (userId: number) =>
  (db.prepare("SELECT COUNT(*) c FROM push_subscriptions WHERE user_id = ?").get(userId) as { c: number }).c;

type Sub = { id: number; endpoint: string; p256dh: string; auth: string };

/** Sends to every device the user has. Returns how many accepted it, and removes devices that have gone away. */
export async function sendToUser(userId: number, message: { title: string; body: string }): Promise<number> {
  const subs = db.prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?").all(userId) as Sub[];
  if (subs.length === 0) return 0;
  const keys = vapidKeys();
  const contact = process.env.PUSH_CONTACT || "https://github.com/RayderC/NitroLog";
  let delivered = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ ...message, url: "/" }),
        { TTL: 24 * 60 * 60, timeout: 15_000, vapidDetails: { subject: contact, publicKey: keys.publicKey, privateKey: keys.privateKey } },
      );
      delivered++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(s.id);
      else console.error("[push]", status ?? e);
    }
  }));
  return delivered;
}

/** One pass over everyone with a device. Safe to run often, because decidePush only fires on changes. */
export async function runPushCheck(today = new Date().toISOString().slice(0, 10)) {
  const users = db.prepare("SELECT DISTINCT s.user_id AS id FROM push_subscriptions s JOIN users u ON u.id = s.user_id WHERE u.disabled = 0").all() as { id: number }[];
  for (const { id: userId } of users) {
    const items: PushItem[] = dueAcross(userId, today).items.map(i => ({ id: i.id, name: i.name, vehicleName: i.vehicleName, status: i.status }));
    const rows = db.prepare("SELECT schedule_id, status, sent_on FROM push_sent WHERE user_id = ?").all(userId) as { schedule_id: number; status: string; sent_on: string }[];
    const sent = new Map<number, PushSent>(rows.map(r => [r.schedule_id, { status: r.status, sentOn: r.sent_on }]));
    const { notify, clear } = decidePush(items, sent, today);
    const forget = db.prepare("DELETE FROM push_sent WHERE user_id = ? AND schedule_id = ?");
    for (const id of clear) forget.run(userId, id);
    if (notify.length === 0) continue;
    // Recorded only after a device accepts it, so an outage retries on the next pass.
    if (await sendToUser(userId, pushMessage(notify)) > 0) {
      const mark = db.prepare(`INSERT INTO push_sent (user_id, schedule_id, status, sent_on) VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id, schedule_id) DO UPDATE SET status = excluded.status, sent_on = excluded.sent_on`);
      for (const i of notify) mark.run(userId, i.id, i.status, today);
    }
  }
}

const HOUR = 60 * 60 * 1000;

export function startPushScheduler() {
  const g = globalThis as unknown as { __nitrologPush?: boolean };
  if (g.__nitrologPush) return;
  g.__nitrologPush = true;
  const run = () => runPushCheck().catch(e => console.error("[push] check failed", e));
  setTimeout(run, 60_000).unref();
  setInterval(run, HOUR).unref();
}
