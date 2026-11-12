"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";

type Info = { available: boolean; builtAt: string | null; pushedAt: string | null; checkedAt: string | null; image: string };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "unknown");

/** Admin: says when a newer image is on Docker Hub, and how to update. Quiet otherwise. */
export default function UpdateNotice() {
  const { data, setData } = useApi<Info>("/api/admin/update");
  const [checking, setChecking] = useState(false);
  if (!data) return null;
  const check = async () => {
    setChecking(true);
    try { setData(await api<Info>("/api/admin/update?force=1")); } finally { setChecking(false); }
  };
  if (!data.available) {
    return (
      <p className="update-quiet">
        {data.builtAt ? <>This version was built {day(data.builtAt)}.</> : <>Running from source, so update checks are off.</>}{" "}
        {data.builtAt && <button type="button" className="link-btn" onClick={check} disabled={checking}>{checking ? "Checking…" : "Check for updates"}</button>}
        {data.builtAt && data.checkedAt && !checking && <span className="update-ok"> Up to date as of {day(data.checkedAt)}.</span>}
      </p>
    );
  }
  return (
    <div className="card section update-card" role="status">
      <div className="card-title">Update available</div>
      <p className="settings-hint">A newer version was published {day(data.pushedAt)}. This one is from {day(data.builtAt)}. To update, run this where your compose file is:</p>
      <pre className="update-cmd">docker compose pull &amp;&amp; docker compose up -d</pre>
      <p className="form-hint">Your data stays. A backup is a good idea first.</p>
    </div>
  );
}
