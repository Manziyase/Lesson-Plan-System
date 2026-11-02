"use client";

/*
 * App shell — LessonHub. Sidebar layout that is collapsible on desktop
 * (icons-only state persisted in localStorage) and off-canvas with a
 * hamburger on mobile. Every control is preserved: academic-year selector,
 * language selector, user box with logout, admin-only links, print header.
 * Product-neutral branding: each school's own name shows in the sidebar,
 * so nothing here is tied to one school.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { api, initials } from "@/lib/client";
import { LangSelect, useI18n } from "@/lib/i18n-client";
import { ThemeToggle } from "@/lib/theme";
import { Icon, type IconName } from "@/components/icons";

export type MetaAssignment = {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
};

export type MetaUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "teacher";
  subjects: string[];
  classes: string[];
  assignments: MetaAssignment[];
  language: string;
  mustChangePassword: boolean;
};

export type Meta = {
  school: {
    id: string;
    name: string;
    district: string;
    sector: string;
    code: string;
    level: string;
    ownership: string;
    province: string;
    cell: string;
    village: string;
    address: string;
    officialEmail: string;
    officialPhone: string;
  } | null;
  me: MetaUser;
  teachers: { id: string; name: string; role: string; email: string; subjects: string[]; classes: string[]; assignments: MetaAssignment[] }[];
  classes: { id: string; name: string; level: string | null; stream: string | null }[];
  subjects: { id: string; name: string }[];
  levels: { id: string; name: string }[];
  learningAreas: { id: string; name: string }[];
  years: { id: string; label: string; startDate: string; endDate: string; isActive: boolean }[];
  activeYear: { id: string; label: string; isActive: boolean } | null;
  /** Admin only: lesson plans submitted but not yet approved. */
  pendingPlans?: number;
  /** Platform-level feature switches, resolved server-side. */
  features: {
    announcements: boolean;
    lessonLibrary: boolean;
    planner: boolean;
    analytics: boolean;
  };
};

const MetaContext = createContext<{ meta: Meta; refresh: () => void; setActiveYear: (y: Meta["activeYear"]) => void }>({
  meta: null as unknown as Meta,
  refresh: () => {},
  setActiveYear: () => {},
});

export function useMeta() {
  return useContext(MetaContext);
}

const NAV_ICONS: Record<string, IconName> = {
  "/dashboard": "dashboard",
  "/planner": "planner",
  "/calendar": "calendar",
  "/plans": "fileText",
  "/library": "book",
  "/approvals": "clipboardCheck",
  "/admin/years": "years",
  "/admin/teachers": "users",
  "/admin/settings": "settings",
  "/profile": "userCircle",
  "/messages": "mail",
  "/notifications": "bell",
};

/** Topbar page titles by route segment. */
function pageTitle(seg: string, fallback: string): string {
  const map: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/planner": "Daily Planner",
    "/calendar": "Calendar",
    "/plans": "My Plans",
    "/library": "Lesson Library",
    "/approvals": "Approvals",
    "/admin/years": "Academic Years",
    "/admin/teachers": "Teachers",
    "/admin/settings": "School Settings",
    "/profile": "My Account",
    "/messages": "Messages",
    "/notifications": "Notifications",
  };
  return map[seg] ?? fallback;
}

export function Shell({ meta, children }: { meta: Meta; children: React.ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [activeYearId, setActiveYearId] = useState(meta.activeYear?.id ?? "");
  const [currentUser, setCurrentUser] = useState(meta.me);
  const [collapsed, setCollapsed] = useState(false); // desktop icon-only
  const [mobileOpen, setMobileOpen] = useState(false); // off-canvas on small screens
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    setCollapsed(localStorage.getItem("slp_sidebar") === "collapsed");
  }, []);

  useEffect(() => {
    setMobileOpen(false); // close the drawer after navigation
  }, [pathname]);

  useEffect(() => {
    let active = true;
    const loadUnread = () => {
      api<{ unread: number }>("/api/messages").then((d) => { if (active) setUnreadMessages(d.unread); }).catch(() => {});
      api<{ unread: number }>("/api/notifications").then((d) => { if (active) setUnreadNotifications(d.unread); }).catch(() => {});
    };
    loadUnread();
    const timer = window.setInterval(loadUnread, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const activeYear = meta.years.find((y) => y.id === activeYearId) ?? meta.activeYear;
  const metaLive: Meta = { ...meta, activeYear: activeYear ?? null };

  const seg = "/" + (pathname.split("/")[1] || "dashboard");

  const navItems: { href: string; label: string }[] = [
    { href: "/dashboard", label: t("Dashboard") },
    ...(meta.features.planner ? [{ href: "/planner", label: t("Daily Planner") }] : []),
    { href: "/calendar", label: t("Calendar") },
    { href: "/plans", label: t("My Plans") },
    ...(meta.features.lessonLibrary ? [{ href: "/library", label: t("Lesson Library") }] : []),
    { href: "/approvals", label: t("Approvals") },        ...(currentUser.role === "admin"
      ? [
          { href: "/admin/years", label: t("Academic Years") },
          { href: "/admin/teachers", label: t("Teachers") },
          { href: "/admin/subjects", label: t("Subjects") },
          { href: "/admin/settings", label: t("School Settings") },
        ]
      : []),
    { href: "/messages", label: t("Messages") },
    { href: "/notifications", label: t("Notifications") },
    { href: "/profile", label: t("My Account") },
  ];

  function toggleCollapse() {
    setCollapsed((c) => {
      localStorage.setItem("slp_sidebar", c ? "" : "collapsed");
      return !c;
    });
  }

  function refresh() {
    router.refresh();
  }

  async function onLogout() {
    await api("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function onLangChange(l: typeof lang) {
    setLang(l);
    try {
      await api("/api/auth/profile", { method: "PUT", body: { language: l } });
      setCurrentUser((u) => ({ ...u, language: l }));
    } catch {
      /* offline — local only */
    }
  }

  const cx = (...parts: (string | boolean | undefined)[]) => parts.filter(Boolean).join(" ");
  const pending = meta.pendingPlans ?? 0;

  return (
    <MetaContext.Provider value={{ meta: metaLive, refresh, setActiveYear: (y) => y && setActiveYearId(y.id) }}>
      <div id="print-header">
        <div className="print-school">{meta.school?.name}</div>
        <div className="print-meta"></div>
      </div>

      <div className={cx("shell", collapsed && "collapsed", mobileOpen && "mobile-open")}>
        <div className="scrim no-print" onClick={() => setMobileOpen(false)} aria-hidden="true" />

        <aside className="sidebar no-print" aria-label={t("Main navigation")}>
          <Link className="sidebar__brand" href="/dashboard">
            <span className="sidebar__title">
              LessonHub
              <small>{t("Plan Once. Teach Better. Grow Together.")}</small>
            </span>
          </Link>
          <div className="sidebar__school">
            <span className="pill" title={meta.school?.name ?? ""}>{meta.school?.name || "—"}</span>
          </div>
          <nav className="sidebar__nav" id="main-nav">
            {navItems.map((n) => (
              <Link key={n.href} href={n.href} className={seg === n.href ? "active" : ""} title={n.label} aria-label={n.label}>
                <span className="ico" aria-hidden="true">
                  <Icon name={NAV_ICONS[n.href] ?? "dashboard"} size={18} />
                </span>
                <span className="lbl" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{n.label}</span>
                  {n.href === "/approvals" && pending > 0 ? (
                    <span className="nav-badge" aria-label={t("{n} plan(s) awaiting approval", { n: pending })}>
                      {pending}
                    </span>
                  ) : null}
                  {n.href === "/messages" && unreadMessages > 0 ? <span className="nav-badge" aria-label={t("{n} unread message(s)", { n: unreadMessages })}>{unreadMessages}</span> : null}
                  {n.href === "/notifications" && unreadNotifications > 0 ? <span className="nav-badge" aria-label={t("{n} unread notification(s)", { n: unreadNotifications })}>{unreadNotifications}</span> : null}
                </span>
              </Link>
            ))}
          </nav>
          <div className="sidebar__foot">
            <Link className="sidebar__userbox" href="/profile" title={t("My Account")}>
              <div className="avatar">{initials(currentUser.name)}</div>
              <div className="usermeta">
                <div className="name">{currentUser.name}</div>
                <div className="role">{currentUser.role === "admin" ? t("Administrator") : t("Teacher")}</div>
              </div>
            </Link>
            <div className="sidebar__foot-row">
              <button className="btn btn-sm sidebar__logout" onClick={onLogout} title={t("Log out")} aria-label={t("Log out")}>
                <Icon name="logout" size={14} />
                <span className="sidebar__logout-label">{t("Log out")}</span>
              </button>
              <ThemeToggle />
            </div>
          </div>
        </aside>

        <div className="content">
          <div className="topbar no-print">
            <button className="btn-icon topbar__hamburger" onClick={() => setMobileOpen(true)} aria-label={t("Open menu")} aria-expanded={mobileOpen}>
              <Icon name="menu" size={18} />
            </button>
            <button className="btn-icon" onClick={toggleCollapse} title={collapsed ? t("Expand sidebar") : t("Collapse sidebar")} aria-label={collapsed ? t("Expand sidebar") : t("Collapse sidebar")}>
              <Icon name={collapsed ? "chevronsRight" : "chevronsLeft"} size={18} />
            </button>
            <span className="topbar__title">{t(pageTitle(seg, "LessonHub"))}</span>
            <span className="topbar__spacer" />
            <div className="topbar__ctl">
              <span className="ylabel">{t("Academic year")}</span>
              <select
                value={activeYearId}
                onChange={(e) => setActiveYearId(e.target.value)}
                aria-label={t("Academic year")}
                title={t("Academic year")}
              >
                {meta.years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                    {y.isActive ? ` (${t("Active")})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <LangSelect value={lang} onChange={onLangChange} className="input" />
          </div>
          <main className="page container">{children}</main>
        </div>
      </div>
    </MetaContext.Provider>
  );
}
