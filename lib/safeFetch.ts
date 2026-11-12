// Fetches one public web page that a person pasted. Because the address comes from a user, every hop is checked
// so it can't be used to reach the server's own network: only http and https on the normal ports, and every
// address a name resolves to must be public. The check runs when the connection is made, so a name that
// changes what it points to between the check and the request can't slip through.
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import { bad } from "./api";

/** Says who's asking. Sites can block it if they want to, and NitroLog then says so. */
export const AGENT = "NitroLog/1.0 (personal vehicle maintenance log; reads one product page a person pasted)";

function privateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || (b === 0 && ip.split(".")[2] === "0")))
    || (a === 198 && (b === 18 || b === 19));
}

/** True for loopback, private, link-local, carrier-grade NAT, multicast and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return privateV4(ip);
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (!net.isIPv6(v6)) return true;
  if (v6 === "::" || v6 === "::1") return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateV4(mapped[1]);
  if (v6.startsWith("::ffff:") || v6.startsWith("64:ff9b:")) return true;
  return /^(fc|fd|fe[89ab]|ff)/.test(v6);
}

type LookupCb = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

/** Resolves a name and refuses it if any of its addresses isn't public. Used by the connection itself. */
function guardedLookup(hostname: string, options: dns.LookupOptions, cb: LookupCb) {
  dns.lookup(hostname, { all: true }, (err, list) => {
    if (err) return cb(err);
    if (!list.length || list.some(a => isPrivateAddress(a.address))) {
      return cb(Object.assign(new Error(`${hostname} isn't a public address`), { code: "EBLOCKED" }));
    }
    if (options?.all) cb(null, list);
    else cb(null, list[0].address, list[0].family);
  });
}

/** Throws a readable 400 when an address isn't a public web page NitroLog may fetch. */
export function checkPublicUrl(u: URL) {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw bad("Links need to start with http:// or https://");
  if (u.port && u.port !== "80" && u.port !== "443") throw bad("That link uses an unusual port, so NitroLog won't open it.");
  if (u.username || u.password) throw bad("Links with a username or password in them can't be read.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isPrivateAddress(host)) throw bad("That isn't a public website.");
  if (/^(localhost|.*\.local|.*\.internal|.*\.lan|.*\.home)$/i.test(host) || !host.includes(".")) throw bad("That isn't a public website.");
}

export type Page = { status: number; url: URL; html: string };

function once(u: URL, timeoutMs: number, maxBytes: number): Promise<{ status: number; location: string | null; body: string }> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, {
      method: "GET",
      lookup: guardedLookup as unknown as typeof dns.lookup,
      headers: { "User-Agent": AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "gzip, deflate, br", "Accept-Language": "en-US,en;q=0.8" },
      timeout: timeoutMs,
    }, res => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        res.resume();
        return resolve({ status, location: res.headers.location ?? null, body: "" });
      }
      const type = String(res.headers["content-type"] ?? "");
      if (status < 400 && type && !/html|xml/i.test(type)) {
        res.destroy();
        return reject(bad("That link isn't a web page."));
      }
      const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
      const stream = enc === "gzip" ? res.pipe(zlib.createGunzip()) : enc === "deflate" ? res.pipe(zlib.createInflate()) : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (c: Buffer) => {
        size += c.length;
        // Product details are in the first few megabytes. Stop there rather than read a huge page.
        if (size > maxBytes) { res.destroy(); stream.destroy(); resolve({ status, location: null, body: Buffer.concat(chunks).toString("utf8") }); return; }
        chunks.push(c);
      });
      stream.on("end", () => resolve({ status, location: null, body: Buffer.concat(chunks).toString("utf8") }));
      stream.on("error", e => reject(e));
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    req.end();
  });
}

/**
 * GETs a public page, following up to five redirects and checking each one. Returns the final address and the
 * page's text. Network failures come back as a status of 0 rather than an error, so the caller can explain.
 */
export async function getPublicPage(start: URL, { timeoutMs = 12_000, maxBytes = 4_000_000 } = {}): Promise<Page> {
  let url = start;
  for (let hop = 0; hop < 6; hop++) {
    checkPublicUrl(url);
    let r: Awaited<ReturnType<typeof once>>;
    try { r = await once(url, timeoutMs, maxBytes); }
    catch (e) {
      if ((e as { status?: number }).status === 400) throw e;
      if ((e as { code?: string }).code === "EBLOCKED") throw bad("That isn't a public website.");
      return { status: 0, url, html: "" };
    }
    if (r.location) { url = new URL(r.location, url); continue; }
    return { status: r.status, url, html: r.body };
  }
  return { status: 0, url, html: "" };
}
