"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthShell from "@/app/components/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [sso, setSso] = useState(false);

  useEffect(() => {
    const ssoError = new URLSearchParams(window.location.search).get("sso_error");
    if (ssoError) setError(ssoError);
    fetch("/api/sso").then(r => r.json()).then(d => setSso(!!d?.enabled)).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/setup").then(r => r.json()).then(d => {
      if (d?.needsSetup) router.replace("/setup"); else setReady(true);
    }).catch(() => setReady(true));
  }, [router]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: f.get("username"), password: f.get("password") }),
    });
    setLoading(false);
    // Full navigation, not router.replace: while signed out the router prefetched "/" and cached
    // proxy.ts's redirect to /login, which it would replay here.
    if (res.ok) window.location.replace("/");
    else setError((await res.json().catch(() => ({}))).message || "Sign in failed");
  }

  if (!ready) return <AuthShell title="" subtitle=""><div className="loading">Loading…</div></AuthShell>;

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your garage.">
      <form onSubmit={submit} className="auth-form">
        {error && <p className="form-error">{error}</p>}
        <div className="form-group">
          <label className="form-label" htmlFor="username">Username</label>
          <input id="username" name="username" className="form-input" autoComplete="username" autoCapitalize="none" required />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="form-input" autoComplete="current-password" required />
        </div>
        <button className="btn-primary btn-lg" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
        {sso && <a className="btn-secondary btn-lg sso-btn" href="/api/sso?start=1">Sign in with Amethyst</a>}
      </form>
    </AuthShell>
  );
}
