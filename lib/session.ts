import { SessionOptions } from "iron-session";

/** `v` is the user's token_version at sign-in. Changing a password bumps it, which ends other sessions. */
export type SessionUser = { id: number; username: string; v: number };

const PLACEHOLDER = "build_time_placeholder_secret_at_least_32_chars";
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const isDev = process.env.NODE_ENV !== "production";

const sessionPassword = process.env.SESSION_SECRET || (isBuild || isDev ? PLACEHOLDER : "");

if (!isBuild && !isDev && (!sessionPassword || sessionPassword === PLACEHOLDER)) {
  throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters in production");
}
if (sessionPassword.length < 32) {
  throw new Error("SESSION_SECRET must be at least 32 characters");
}

export const sessionOptions: SessionOptions = {
  password: sessionPassword,
  cookieName: "nitrolog_session",
  ttl: 60 * 60 * 24 * 30,
  cookieOptions: {
    // Same default as the owner's other apps, so one image works over plain HTTP and through a tunnel.
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    httpOnly: true,
    sameSite: "lax",
  },
};

