"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";

type SignIn = { at: string; ip: string | null; device: string; ok: boolean };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Settings: recent sign-ins (and wrong-password tries), and signing out every other device. */
export default function SignInsCard() {
  const { data, reload } = useApi<SignIn[]>("/api/me/sign-ins");
  const [msg, setMsg] = useState("");
  const failed = (data ?? []).filter(s => !s.ok).length;

  async function signOutOthers() {
    setMsg("");
    try {
      await api("/api/me/sign-ins", { method: "POST" });
      setMsg("Signed out everywhere else. This device stays signed in.");
      reload();
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="card section" id="sign-ins">
      <div className="card-title" style={{ marginBottom: 6 }}>Sign-ins</div>
      <p className="settings-hint">
        Recent sign-ins to your account{failed > 0 ? <>, including <b>{failed} wrong {failed === 1 ? "password" : "passwords"}</b></> : null}.
        If you see one that wasn&apos;t you, sign out everywhere and change your password.
      </p>
      {data && data.length > 0 && (
        <details className="signin-list">
          <summary>Last {data.length} · {when(data[0].at)}, {data[0].device}</summary>
          <ul>
            {data.map((s, i) => (
              <li key={i} className={s.ok ? "" : "signin-failed"}>
                <span>{when(s.at)}</span><span>{s.device}</span><span>{s.ip ?? "this network"}</span>
                {!s.ok && <span className="badge badge-red">Wrong password</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex gap-2 items-center" style={{ marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn-secondary btn-sm" onClick={signOutOthers}>Sign out everywhere else</button>
        {msg && <span className="form-hint" role="status">{msg}</span>}
      </div>
    </div>
  );
}
