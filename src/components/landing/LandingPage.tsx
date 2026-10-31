"use client";

/*
 * Marketing landing page for signed-out visitors.
 *
 * Server-rendered from src/app/page.tsx (which redirects signed-in users to
 * /dashboard). Everything here is dependency-free: animations use CSS,
 * reveal-on-scroll uses IntersectionObserver, and the product demo is real
 * React state — no screenshots, no image assets, no motion library.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Icon, type IconName } from "@/components/icons";
import { ThemeToggle } from "@/lib/theme";

/* ------------------------------------------------------------------ */
/* hooks                                                               */
/* ------------------------------------------------------------------ */

function useScrollState() {
  const [progress, setProgress] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
      setScrolled(el.scrollTop > 8);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return { progress, scrolled };
}

/** Adds `.is-in` to every [data-reveal] node the first time it scrolls in. */
function useReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (nodes.length === 0) return;
    if (typeof IntersectionObserver === "undefined") {
      nodes.forEach((n) => n.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
}

function CountUp({ to, suffix = "", duration = 1500 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(to);
      return;
    }
    let raf = 0;
    let started = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        const step = (now: number) => {
          if (!started) started = now;
          const p = Math.min(1, (now - started) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setValue(Math.round(to * eased));
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [to, duration]);

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* content                                                             */
/* ------------------------------------------------------------------ */

type Feature = { icon: IconName; title: string; text: string };

const FEATURES: Feature[] = [
  {
    icon: "planner",
    title: "Competence-based planner",
    text: "Time, learning area, competence and procedure — the four columns the Rwandan curriculum asks for, ready to fill in.",
  },
  {
    icon: "clipboardCheck",
    title: "Approval with a paper trail",
    text: "Teachers submit, admins approve, and every plan keeps the name and date of the person who signed it off.",
  },
  {
    icon: "layers",
    title: "A library that improves",
    text: "Search by class, learning area or term, then duplicate a proven lesson into next week in a single click.",
  },
  {
    icon: "calendar",
    title: "The whole term at a glance",
    text: "Every planned lesson on a month calendar, so gaps and clashes show up before they turn into a Monday-morning rush.",
  },
  {
    icon: "school",
    title: "Your school, set up once",
    text: "Classes, streams, learning areas, academic years and terms — configured for your school, not a generic demo.",
  },
  {
    icon: "printer",
    title: "Print-ready, always",
    text: "Clean A4 output for filing, inspection and sharing with parents — without fighting a word processor.",
  },
];

const STEPS = [
  {
    icon: "school" as IconName,
    title: "Set up your school",
    text: "Add your classes, learning areas and the academic year. A few minutes, once.",
  },
  {
    icon: "planner" as IconName,
    title: "Plan the week",
    text: "Teachers draft lessons in the four-column planner, alone or side by side.",
  },
  {
    icon: "checkCircle" as IconName,
    title: "Approve and share",
    text: "Admins review and approve; the lesson joins the school library for everyone.",
  },
];

const FAQS = [
  {
    q: "Is LessonHub free to start?",
    a: "Yes. Create your school’s workspace and start planning straight away — no credit card required.",
  },
  {
    q: "Does it work on a phone?",
    a: "Yes. The planner, calendar and lesson library are fully responsive, so teachers can plan from a phone, a tablet or a shared laptop.",
  },
  {
    q: "Which languages are supported?",
    a: "English, French and Kinyarwanda. Each teacher can pick their own language and the interface follows them.",
  },
  {
    q: "Who can see our lesson plans?",
    a: "Only people in your school’s workspace. A plan stays private to its author and the admins until it is approved and added to the library.",
  },
  {
    q: "Can we print the plans?",
    a: "Yes. Every plan prints as a clean, inspection-ready A4 document with the school header and the four-column structure intact.",
  },
  {
    q: "How do teachers join?",
    a: "An administrator adds teachers from the admin area. Each teacher gets their own login, their classes and their subjects.",
  },
];

const MOCK_ROWS = [
  { time: "08:00", area: "English", text: "Unit 2 · My school — describe your school in three sentences.", tone: "gold" },
  { time: "08:40", area: "Mathematics", text: "Fractions: compare and order halves, quarters and thirds.", tone: "navy" },
  { time: "09:20", area: "Kinyarwanda", text: "Ibisobanuro by’umuryango — reading and comprehension.", tone: "navy" },
];

const LIBRARY = [
  { area: "English", cls: "P5", unit: "My school", term: "Term 1" },
  { area: "Mathematics", cls: "P4", unit: "Fractions", term: "Term 1" },
  { area: "Science & Elementary Technology", cls: "P3", unit: "Writing with a computer", term: "Term 2" },
  { area: "Kinyarwanda", cls: "P2", unit: "Umuryango wanjye", term: "Term 1" },
];

const PENDING = [
  { teacher: "Ms. Ann", cls: "P5", area: "English", unit: "My school", when: "Today, 08:12" },
  { teacher: "Mr. Olivier", cls: "P4", area: "Science & Elementary Technology", unit: "Simple machines", when: "Yesterday, 16:40" },
];

/* ------------------------------------------------------------------ */
/* small building blocks                                               */
/* ------------------------------------------------------------------ */

function SectionHead({
  eyebrow,
  title,
  sub,
  center = false,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  center?: boolean;
}) {
  return (
    <div className={`land-head${center ? " land-head--center" : ""}`} data-reveal>
      <span className="land-eyebrow">{eyebrow}</span>
      <h2 className="land-h2">{title}</h2>
      {sub ? <p className="land-sub">{sub}</p> : null}
    </div>
  );
}

/** Stagger helper: returns a CSS custom property consumed by [data-reveal]. */
function delay(i: number): CSSProperties {
  return { "--d": `${i * 70}ms` } as CSSProperties;
}

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

export default function LandingPage({ registrationOpen }: { registrationOpen: boolean }) {
  const { progress, scrolled } = useScrollState();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<"plan" | "approve" | "library">("plan");
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const heroRef = useRef<HTMLDivElement>(null);

  useReveal();

  const startHref = registrationOpen ? "/register" : "/login";
  const startLabel = registrationOpen ? "Get started free" : "Sign in";

  const onHeroMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = heroRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", String((e.clientX - rect.left) / rect.width - 0.5));
    el.style.setProperty("--my", String((e.clientY - rect.top) / rect.height - 0.5));
  };

  const resetHero = () => {
    const el = heroRef.current;
    if (!el) return;
    el.style.setProperty("--mx", "0");
    el.style.setProperty("--my", "0");
  };

  const filtered = LIBRARY.filter((l) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${l.area} ${l.cls} ${l.unit} ${l.term}`.toLowerCase().includes(q);
  });

  return (
    <div className="land">
      <noscript>
        <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      <div className="land-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />

      {/* ---------------------------------------------------------- nav */}
      <header className={`land-nav${scrolled ? " is-scrolled" : ""}`}>
        <div className="land-nav__inner">
          <Link href="/" className="land-brand">
            <span className="land-brand__mark">
              <Icon name="book" size={20} />
            </span>
            <span className="land-brand__text">
              LessonHub
              <small>Lesson planning, simplified</small>
            </span>
          </Link>

          <nav className="land-nav__links" aria-label="Sections">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#inside">Inside the app</a>
            <a href="#faq">FAQ</a>
          </nav>

          <div className="land-nav__actions">
            <ThemeToggle />
            <Link href="/login" className="btn btn-ghost land-nav__signin">
              Sign in
            </Link>
            <Link href={startHref} className="btn btn-primary land-nav__cta">
              {registrationOpen ? "Get started" : "Open app"}
              <Icon name="arrowRight" size={15} />
            </Link>
            <button
              type="button"
              className="btn-icon land-nav__burger"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="land-mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Icon name={menuOpen ? "x" : "menu"} size={20} />
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div className="land-mobile" id="land-mobile-menu">
            {[
              ["#features", "Features"],
              ["#how", "How it works"],
              ["#inside", "Inside the app"],
              ["#faq", "FAQ"],
            ].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                {label}
                <Icon name="arrowRight" size={15} />
              </a>
            ))}
            <div className="land-mobile__cta">
              <Link href="/login" className="btn btn-block" onClick={() => setMenuOpen(false)}>
                Sign in
              </Link>
              <Link href={startHref} className="btn btn-primary btn-block" onClick={() => setMenuOpen(false)}>
                {startLabel}
              </Link>
            </div>
          </div>
        ) : null}
      </header>

      <main>
        {/* -------------------------------------------------------- hero */}
        <section className="land-hero">
          <div className="land-hero__aura" aria-hidden="true" />
          <div className="land-wrap land-hero__grid">
            <div className="land-hero__copy">
              <span className="land-badge">
                <span className="land-badge__dot" aria-hidden="true" />
                Built for Rwandan schools · Competence-based
              </span>

              <h1 className="land-h1">
                Plan once.
                <br />
                <span className="land-grad">Teach better.</span>
                <br />
                Grow together.
              </h1>

              <p className="land-lead">
                LessonHub replaces the paper planner with one calm, shared workspace — draft
                competence-based lessons, get them approved, and reuse the best ones across your
                whole school.
              </p>

              <div className="land-cta-row">
                <Link href={startHref} className="btn btn-primary land-btn-lg">
                  {startLabel}
                  <Icon name="arrowRight" size={16} />
                </Link>
                <a href="#inside" className="btn land-btn-lg land-btn-soft">
                  <Icon name="eye" size={16} />
                  See it in action
                </a>
              </div>

              <ul className="land-trust">
                <li>
                  <Icon name="checkCircle" size={15} /> No credit card
                </li>
                <li>
                  <Icon name="checkCircle" size={15} /> Your school’s own workspace
                </li>
                <li>
                  <Icon name="checkCircle" size={15} /> Works on any device
                </li>
              </ul>
            </div>

            <div
              className="land-hero__visual"
              ref={heroRef}
              onPointerMove={onHeroMove}
              onPointerLeave={resetHero}
            >
              <div className="land-mock" aria-hidden="true">
                <div className="land-mock__bar">
                  <span className="land-dot land-dot--r" />
                  <span className="land-dot land-dot--y" />
                  <span className="land-dot land-dot--g" />
                  <span className="land-mock__url">lessonhub · planner</span>
                </div>

                <div className="land-mock__body">
                  <div className="land-mock__title">
                    <div>
                      <strong>P5 · English</strong>
                      <span>Term 1 · Week 4 · Ms. Ann</span>
                    </div>
                    <span className="land-chip land-chip--ok">
                      <Icon name="check" size={12} /> Approved
                    </span>
                  </div>

                  <div className="land-mock__rows">
                    {MOCK_ROWS.map((row, i) => (
                      <div className="land-mrow" key={row.time} style={delay(i)}>
                        <span className={`land-time${row.tone === "gold" ? " is-gold" : ""}`}>{row.time}</span>
                        <div className="land-mrow__text">
                          <strong>{row.area}</strong>
                          <span>{row.text}</span>
                        </div>
                        <span className="land-mrow__tick">
                          <Icon name="check" size={12} />
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="land-mock__foot">
                    <span>3 lessons · 1 term</span>
                    <span className="land-mock__pulse" />
                  </div>
                </div>
              </div>

              <div className="land-float land-float--1">
                <Icon name="layers" size={16} /> 8 learning areas
              </div>
              <div className="land-float land-float--2">
                <Icon name="globe" size={16} /> EN · FR · RW
              </div>
              <div className="land-float land-float--3">
                <Icon name="printer" size={16} /> Print-ready
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- stats */}
        <section className="land-stats" aria-label="LessonHub at a glance">
          <div className="land-wrap land-stats__grid">
            {[
              { n: 8, label: "Learning areas", suffix: "" },
              { n: 9, label: "Class levels, N1–P6", suffix: "" },
              { n: 3, label: "Languages", suffix: "" },
              { n: 4, label: "Planning columns", suffix: "" },
            ].map((s) => (
              <div className="land-stat" key={s.label}>
                <div className="land-stat__num">
                  <CountUp to={s.n} suffix={s.suffix} />
                </div>
                <div className="land-stat__label">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------- features */}
        <section className="land-section" id="features">
          <div className="land-wrap">
            <SectionHead
              eyebrow="Everything in one place"
              title="Built around the real school week"
              sub="Not a generic note-taking app. Every screen follows the way Rwandan schools actually plan, review and file lessons."
            />
            <div className="land-features">
              {FEATURES.map((f, i) => (
                <article className="land-feature" key={f.title} data-reveal style={delay(i)}>
                  <span className="land-feature__ico">
                    <Icon name={f.icon} size={21} />
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- how it works */}
        <section className="land-section land-section--tint" id="how">
          <div className="land-wrap">
            <SectionHead
              eyebrow="Three calm steps"
              title="From a blank week to approved lessons"
              center
              sub="No training day required. If a teacher can send a message, they can plan a lesson."
            />
            <div className="land-steps">
              {STEPS.map((s, i) => (
                <article className="land-step" key={s.title} data-reveal style={delay(i)}>
                  <span className="land-step__num">{i + 1}</span>
                  <span className="land-step__ico">
                    <Icon name={s.icon} size={22} />
                  </span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ inside */}
        <section className="land-section" id="inside">
          <div className="land-wrap">
            <SectionHead
              eyebrow="Inside the app"
              title="Try the parts that matter"
              center
              sub="Three small previews, wired to real interactions. Click a tab, approve a plan, search the library."
            />

            <div
              className="land-tabs"
              role="tablist"
              aria-label="App preview"
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const order = ["plan", "approve", "library"] as const;
                const step = e.key === "ArrowRight" ? 1 : order.length - 1;
                const next = order[(order.indexOf(tab) + step) % order.length];
                setTab(next);
                document.getElementById(`land-tab-${next}`)?.focus();
              }}
            >
              {(
                [
                  ["plan", "Plan", "planner"],
                  ["approve", "Approve", "clipboardCheck"],
                  ["library", "Library", "layers"],
                ] as const
              ).map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`land-tab-${id}`}
                  aria-controls="land-demo-panel"
                  aria-selected={tab === id}
                  className={`land-tab${tab === id ? " is-active" : ""}`}
                  onClick={() => setTab(id)}
                >
                  <Icon name={icon} size={16} />
                  {label}
                </button>
              ))}
            </div>

            <div
              className="land-demo"
              key={tab}
              role="tabpanel"
              id="land-demo-panel"
              aria-labelledby={`land-tab-${tab}`}
              tabIndex={0}
            >
              <div className="land-demo__bar">
                <span className="land-dot land-dot--r" />
                <span className="land-dot land-dot--y" />
                <span className="land-dot land-dot--g" />
                <span className="land-demo__url">
                  lessonhub.app / {tab === "plan" ? "planner" : tab === "approve" ? "approvals" : "library"}
                </span>
              </div>

              {tab === "plan" ? (
                <div className="land-demo__body">
                  <div className="land-planner__meta">
                    <span className="land-chip land-chip--navy">P5</span>
                    <span className="land-chip">English</span>
                    <span className="land-chip">Term 1 · Week 4</span>
                    <span className="land-chip land-chip--muted">Draft</span>
                  </div>
                  <div className="land-planner">
                    <div className="land-planner__head">
                      <span>Time</span>
                      <span>Learning area</span>
                      <span>Competence</span>
                      <span>Procedure</span>
                    </div>
                    {[
                      ["08:00–08:40", "English", "Name of my school", "Begin by asking learners to describe their school in three sentences…"],
                      ["08:40–09:20", "Mathematics", "Compare fractions", "Use paper strips to compare halves, quarters and thirds…"],
                    ].map((r) => (
                      <div className="land-planner__row" key={r[0]}>
                        <span>{r[0]}</span>
                        <span>{r[1]}</span>
                        <span>{r[2]}</span>
                        <span>{r[3]}</span>
                      </div>
                    ))}
                  </div>
                  <p className="land-demo__hint">
                    <Icon name="info" size={15} /> Four columns, exactly as the curriculum expects.
                  </p>
                </div>
              ) : null}

              {tab === "approve" ? (
                <div className="land-demo__body">
                  <div className="land-approve">
                    {PENDING.map((p) => {
                      const done = approved[p.teacher];
                      return (
                        <div className={`land-approve__row${done ? " is-done" : ""}`} key={p.teacher}>
                          <span className="land-approve__avatar">{p.teacher.replace(/^(Ms\.|Mr\.)\s*/, "").slice(0, 1)}</span>
                          <div className="land-approve__meta">
                            <strong>
                              {p.teacher} · {p.cls}
                            </strong>
                            <span>
                              {p.area} — {p.unit}
                            </span>
                            <em>{p.when}</em>
                          </div>
                          <button
                            type="button"
                            className={`btn btn-sm${done ? " land-approve__done" : " btn-primary"}`}
                            onClick={() => setApproved((prev) => ({ ...prev, [p.teacher]: !prev[p.teacher] }))}
                          >
                            {done ? (
                              <>
                                <Icon name="check" size={14} /> Approved
                              </>
                            ) : (
                              "Approve"
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="land-demo__hint">
                    <Icon name="shield" size={15} /> The approver’s name and date are stored with the plan.
                  </p>
                </div>
              ) : null}

              {tab === "library" ? (
                <div className="land-demo__body">
                  <div className="land-search">
                    <Icon name="search" size={16} />
                    <input
                      type="search"
                      placeholder="Search by class, learning area or unit…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label="Search the lesson library preview"
                    />
                    {query ? (
                      <button type="button" className="land-search__clear" onClick={() => setQuery("")} aria-label="Clear search">
                        <Icon name="x" size={14} />
                      </button>
                    ) : null}
                  </div>
                  <div className="land-lib">
                    {filtered.length === 0 ? (
                      <p className="land-lib__empty">No lessons match “{query}”. Try “P5” or “English”.</p>
                    ) : (
                      filtered.map((l) => (
                        <article className="land-lib__card" key={`${l.cls}-${l.unit}`}>
                          <div className="land-lib__chips">
                            <span className="land-chip land-chip--navy">{l.cls}</span>
                            <span className="land-chip">{l.term}</span>
                          </div>
                          <strong>{l.unit}</strong>
                          <span>{l.area}</span>
                          <span className="land-lib__reuse">
                            <Icon name="copy" size={13} /> Reuse in one click
                          </span>
                        </article>
                      ))
                    )}
                  </div>
                  <p className="land-demo__hint">
                    <Icon name="layers" size={15} /> Type in the box — the cards filter as you type.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- faq */}
        <section className="land-section land-section--tint" id="faq">
          <div className="land-wrap">
            <SectionHead
              eyebrow="Questions, answered"
              title="The things schools ask first"
              center
              sub="Still curious? Sign in and explore a live workspace — or register your school and invite your teachers."
            />
            <div className="land-faq">
              {FAQS.map((item, i) => {
                const open = openFaq === i;
                return (
                  <div className={`land-faq__item${open ? " is-open" : ""}`} key={item.q} data-reveal style={delay(i)}>
                    <button
                      type="button"
                      className="land-faq__q"
                      aria-expanded={open}
                      onClick={() => setOpenFaq(open ? null : i)}
                    >
                      {item.q}
                      <Icon name="chevronDown" size={18} style={{ transition: "transform .25s ease", transform: open ? "rotate(180deg)" : "none" }} />
                    </button>
                    <div className="land-faq__a">
                      <div>
                        <p>{item.a}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- cta */}
        <section className="land-section">
          <div className="land-wrap">
            <div className="land-cta" data-reveal>
              <div className="land-cta__glow" aria-hidden="true" />
              <span className="land-cta__eyebrow">Start this week</span>
              <h2>Ready to plan a calmer week?</h2>
              <p>
                Set up your school’s workspace in minutes. Your first lesson plan is a few clicks
                away — and your teachers will thank you.
              </p>
              <div className="land-cta__row">
                <Link href={startHref} className="btn btn-accent land-btn-lg">
                  {startLabel}
                  <Icon name="arrowRight" size={16} />
                </Link>
                <Link href="/login" className="btn land-btn-lg land-btn-onDark">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------- footer */}
      <footer className="land-foot">
        <div className="land-wrap land-foot__inner">
          <div className="land-foot__brand">
            <span className="land-brand__mark">
              <Icon name="book" size={18} />
            </span>
            <div>
              <strong>LessonHub</strong>
              <p>Plan once. Teach better. Grow together.</p>
            </div>
          </div>
          <nav className="land-foot__links" aria-label="Footer">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#faq">FAQ</a>
            <Link href="/login">Sign in</Link>
            <Link href={startHref}>{registrationOpen ? "Register" : "Open app"}</Link>
          </nav>
          <p className="land-foot__copy">© {new Date().getFullYear()} LessonHub · Made for Rwandan schools</p>
        </div>
      </footer>
    </div>
  );
}
