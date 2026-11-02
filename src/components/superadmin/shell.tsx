"use client";

/*
 * Dedicated Super Admin shell: same visual language as the school workspace
 * but a distinct navigation set and identity. Collapsible on desktop,
 * off-canvas on mobile, theme-aware.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { ThemeToggle } from "@/lib/theme";
import { saApi, initials } from "@/lib/superadmin-client";

export type SaAdmin = {
  id: string;
  name: string;
  email: string;
  status: string;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/superadmin", label: "Overview", icon: "dashboard" },
  { href: "/superadmin/schools", label: "Schools", icon: "school" },
  { href: "/superadmin/users", label: "Users", icon: "users" },
  { href: "/superadmin/subscriptions", label: "Subscriptions & Billing", icon: "creditCard" },
  { href: "/superadmin/announcements", label: "Announcements", icon: "megaphone" },
  { href: "/superadmin/logs", label: "Activity & Audit Logs", icon: "activity" },
  { href: "/superadmin/monitoring", label: "System Monitoring", icon: "server" },
  { href: "/superadmin/settings", label: "Platform Settings", icon: "settings" },
];

const TITLES: Record<string, string> = {
  "/superadmin": "Platform Overview",
  "/superadmin/schools": "Schools",
  "/superadmin/users": "Users",
  "/superadmin/subscriptions": "Subscriptions & Billing",
  "/superadmin/announcements": "Announcements",
  "/superadmin/logs": "Activity & Audit Logs",
  "/superadmin/monitoring": "System Monitoring",
  "/superadmin/settings": "Platform Settings",
};

export function SuperAdminShell({
  admin,
  platformName,
  children,
}: {
  admin: SaAdmin;
  platformName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("slp_sa_sidebar") === "collapsed");
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);

  function toggleCollapse() {
    setCollapsed((c) => {
      localStorage.setItem("slp_sa_sidebar", c ? "" : "collapsed");
      return !c;
    });
  }

  async function onLogout() {
    try {
      await saApi("/api/superadmin/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/superadmin/login";
    }
  }

  const cx = (...parts: (string | boolean | undefined)[]) => parts.filter(Boolean).join(" ");
  const active = (href: string) => (href === "/superadmin" ? pathname === href : pathname.startsWith(href));

  return (
    <div className={cx("shell sa-shell", collapsed && "collapsed", mobileOpen && "mobile-open")}>
      <div className="scrim no-print" onClick={() => setMobileOpen(false)} aria-hidden="true" />

      <aside className="sidebar no-print" aria-label="Platform administration navigation">
        <Link className="sidebar__brand" href="/superadmin">
          <span className="sa-brandmark" aria-hidden="true">
            <Icon name="shield" size={20} />
          </span>
          <span className="sidebar__title">
            {platformName}
            <small>Platform Console</small>
          </span>
        </Link>
        <div className="sidebar__school">
          <span className="pill" title="Super Admin">
            Super Admin
          </span>
        </div>
        <nav className="sidebar__nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={active(n.href) ? "active" : ""} title={collapsed ? n.label : undefined}>
              <span className="ico" aria-hidden="true">
                <Icon name={n.icon} size={18} />
              </span>
              <span className="lbl">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar__foot">
          <div className="sidebar__userbox" title={admin.email}>
            <div className="avatar">{initials(admin.name)}</div>
            <div className="usermeta">
              <div className="name">{admin.name}</div>
              <div className="role">Super Administrator</div>
            </div>
          </div>
          <div className="sidebar__foot-row">
            <button className="btn btn-sm sidebar__logout" onClick={onLogout}>
              <Icon name="logout" size={14} />
              Log out
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="content">
        <div className="topbar no-print">
          <button
            className="btn-icon topbar__hamburger"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
          >
            <Icon name="menu" size={18} />
          </button>
          <button
            className="btn-icon"
            onClick={toggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon name={collapsed ? "chevronsRight" : "chevronsLeft"} size={18} />
          </button>
          <span className="topbar__title">{TITLES[pathname] ?? "Platform Console"}</span>
          <span className="topbar__spacer" />
          <span className={"sa-top-chip " + (admin.mfaEnabled ? "ok" : "warn")}>
            <Icon name="shield" size={13} />
            MFA {admin.mfaEnabled ? "on" : "off"}
          </span>
          <span className="sa-top-chip">
            <span className="sa-dot" />
            {platformName}
          </span>
        </div>
        <main className="page container">
          {admin.mustChangePassword ? (
            <div className="banner banner-warn no-print" style={{ marginBottom: 16 }}>
              <Icon name="lock" size={16} />
              <span>
                Your account still uses a temporary password.{" "}
                <Link href="/superadmin/settings#account">Change it now</Link>.
              </span>
            </div>
          ) : null}
          {!admin.mfaEnabled ? (
            <div className="banner banner-info no-print" style={{ marginBottom: 16 }}>
              <Icon name="shield" size={16} />
              <span>
                Multi-factor authentication is not enabled.{" "}
                <Link href="/superadmin/settings#account">Enable MFA</Link> to protect platform administration.
              </span>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
