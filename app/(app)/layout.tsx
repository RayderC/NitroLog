"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "@/app/components/Icon";
import { MeContext, type Me } from "@/app/components/MeContext";
import { api, useApi } from "@/lib/client";

const NAV = [
  { href: "/", label: "Due", icon: "gauge" },
  { href: "/vehicles", label: "Garage", icon: "car" },
  { href: "/parts", label: "Parts", icon: "box" },
  { href: "/reports", label: "Reports", icon: "chart" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const { data: me, reload } = useApi<Me>("/api/me");

  useEffect(() => { setOpen(false); }, [path]);

  async function logout() {
    // Stop this device getting reminders with vehicle names on them after signing out.
    try {
      const sub = await (await navigator.serviceWorker?.getRegistration())?.pushManager?.getSubscription();
      if (sub) {
        await api("/api/push/unsubscribe", { body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
    } catch { /* Signing out matters more than this cleanup. */ }
    await api("/api/logout", { method: "POST" });
    // Full navigation so the router drops its cached signed-in pages.
    window.location.replace("/login");
  }

  if (!me) return <div className="loading" style={{ minHeight: "100vh" }}>Loading…</div>;

  const nav = me.isAdmin ? [...NAV, { href: "/admin", label: "Admin", icon: "admin" }] : NAV;

  return (
    <MeContext.Provider value={{ me, reloadMe: reload }}>
      <div className="dashboard-root">
        <header className="dash-mobile-bar">
          <button className="dash-hamburger" onClick={() => setOpen(true)} aria-label="Menu">
            <span /><span /><span />
          </button>
          <span className="dash-mobile-title">NitroLog</span>
        </header>

        {open && <div className="dash-backdrop" onClick={() => setOpen(false)} />}

        <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
          <div className="sidebar-logo-wrap">
            <span className="sidebar-logo">NitroLog</span>
            <button className="sidebar-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>
          <nav className="sidebar-nav">
            <Link className="sidebar-start" href="/service/new"><Icon name="plus" />Log service</Link>
            {nav.map(n => (
              <Link key={n.href} href={n.href} className={`sidebar-item ${isActive(path, n.href) ? "active" : ""}`}>
                <Icon name={n.icon} />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="sidebar-user">{me.username}</div>
            <button className="sidebar-item" onClick={logout}><Icon name="logout" />Sign out</button>
          </div>
        </aside>

        <main className="dashboard-main has-tabbar">{children}</main>

        <nav className="tabbar">
          <Link href="/" className={`tabbar-item ${isActive(path, "/") ? "active" : ""}`}><Icon name="gauge" size={20} /><span>Due</span></Link>
          <Link href="/vehicles" className={`tabbar-item ${isActive(path, "/vehicles") ? "active" : ""}`}><Icon name="car" size={20} /><span>Garage</span></Link>
          <Link href="/service/new" className="tabbar-item tabbar-main"><Icon name="plus" size={22} /><span>Log</span></Link>
          <Link href="/settings" className={`tabbar-item ${isActive(path, "/settings") ? "active" : ""}`}><Icon name="settings" size={20} /><span>Settings</span></Link>
          <button className="tabbar-item" onClick={() => setOpen(true)}><Icon name="menu" size={20} /><span>More</span></button>
        </nav>
      </div>
    </MeContext.Provider>
  );
}
