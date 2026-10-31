# Ireme — Next.js (v2)

The Rwanda School Lesson Planning & Knowledge Management System, rebuilt as a
production-ready **Next.js full-stack application** while preserving every
feature and byte of legacy data from the original Node.js app (in `../server`,
`../public`).

Teachers plan **exactly as they normally do** — one daily table with four
columns — and every row is automatically archived as a structured, searchable
lesson record:

| TIME | LEARNING AREA | LEARNING COMPETENCE | LESSON PROCEDURE |
|------|---------------|---------------------|------------------|
| 08:00-08:40 | P5 · Mathematics | Unit 5: Multiplication… | Introduction → Development → Assessment |

One daily plan covers **all of the day's lessons across classes**; each row is
stored by teacher, class, learning area, unit/topic, date, term and academic
year — searchable, reusable, and ready for the head teacher's file.

## Quick start

```bash
npm install
npx prisma db push            # create/update the PostgreSQL schema (Neon)
npm run db:seed-demo          # optional: GS Kanyinya demo school (fresh installs)
npm run dev                   # http://localhost:3100
```

**Bring your existing school data across** (from the legacy `../data/db.json`):

```bash
npm run db:migrate:legacy     # non-destructive; preserves ids & password hashes
```

Log in with the accounts you already have — passwords are kept as-is. For the
demo school: `admin@school.rw` / `changeme123` (teachers: `jean@school.rw`,
`claudine@school.rw`, …).

**Production:**

```bash
npm run build
npm start                     # PORT=3000 by default (set PORT to change)
```

## What's inside

```
src/
  app/
    (app)/                    auth-guarded pages inside the shell
      dashboard/              stats, per-class/area charts, activity, recent plans
      planner/                ★ the four-column daily planner (reuse, duplicate, print)
      plans/                  plan archive with filters · plans/[id] read-only + print
      library/                lesson library (All Lessons / By Unit)
      lessons/[id]/           structured lesson record + similar lessons
      profile/                account info, language, password change
      admin/                  years · teachers · school settings (admin only)
    api/                      REST endpoints (auth, meta, plans, lessons, years, teachers, …)
    page.tsx                  public landing page (signed-in users → /dashboard)
    login/ register/ signup/  public pages (signup = first-run wizard)
  components/                 Shell (topbar/nav/year+language), UI kit (toast, modal, chips…)
    landing/                  marketing landing page (hero, features, live demo, FAQ)
  lib/                        db (Prisma), session, password (scrypt), plans (similarity),
                              plan-input (validation), util, i18n (en/fr/rw)
prisma/schema.prisma          relational schema (ids preserved from legacy data)
scripts/migrate-legacy.mjs    JSON → PostgreSQL migration (non-destructive)
scripts/seed-demo.mjs         demo school for fresh installs
scripts/smoke-next.mjs        end-to-end API test (50 checks)
```

## Feature parity with the legacy app

- **Daily Planner** — the familiar four-column table; class chosen per row;
  save archives each row as a lesson record. Add/remove rows, reuse a past
  lesson, duplicate the plan to another date, print with the school header.
- **Lesson Library** — school-wide search by keyword, class, area, term and
  teacher; "By Unit" browsing; similar-lesson suggestions (word-fingerprint
  similarity ≥ 0.25, same class + area).
- **Plan archive** — every daily plan kept, filterable by date range, class,
  area, term and teacher (admins), scope switch between whole school and your
  own records.
- **Reuse & duplicate** — copy any lesson into today's plan; copy any shared
  plan into your own archive with all rows.
- **Teacher accounts** — admin-created (initial password `changeme123`, forced
  change at first login); profile self-service (name, subjects, language,
  password).
- **Administration** — academic years (add/edit/activate), staff management,
  school identity, learning areas, and the CBC class configuration (levels
  Nursery 1–3, P1–P6, S1–S6 with A–H streams).
- **First-run signup wizard** — creates the admin account, school info and
  class levels; only available while the installation has no school.
- **i18n** — English, French and Kinyarwanda throughout; the choice follows the
  signed-in user's profile.
- **Print** — clean school-headed layout for the planner and any archived plan.

## Security

- Sessions: opaque 48-char tokens stored server-side (Session table), delivered
  in an `HttpOnly` + `SameSite=Lax` cookie, 30-day TTL, revoked on logout.
- Passwords: `scrypt` (12-byte salt, 32-byte key) — **the exact legacy format**,
  so migrated accounts keep working without a reset.
- Per-IP login throttling (12 attempts / 15 min), identical to the legacy app.
- Role-based access: `admin` and `teacher`. Plans/lessons are readable
  school-wide but only the author (or an admin) can edit or delete them. Every
  query is scoped to the user's school.
- Server-side authorisation on every route handler and page layout; no
  self-signup once a school exists.

## Data migration (non-destructive)

`npm run db:migrate:legacy` reads the legacy JSON database and writes into
PostgreSQL **only when the target is empty** (use `--force` to append; ids never
collide):

- every id is preserved (`school_rt`, `user_ru`, `plan_7361a1`,
  `plan_7361a1_r1`, …) — URLs, lesson ids and cross-references stay valid;
- password hashes are copied verbatim — nobody resets a password;
- plans keep their rows; lesson records are derived with the same rules
  (unit = first line of the competence);
- live sessions are imported so signed-in users stay signed in;
- if a plan references a teacher missing from the users collection, a stub
  account is recreated from the stored teacher name (change required at first
  login).

The legacy `data/db.json` is never modified.

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `DATABASE_URL` | — (required) | PostgreSQL connection string (Neon, Vercel Postgres, Supabase, …) |
| `REGISTRATION_CLOSED` | unset | `1` disables self-registration |
| `PORT` | `3000` (dev: 3100) | HTTP port |

### Database (Neon or any PostgreSQL)

The datasource provider is `postgresql`; there is no SQLite build any more.

**Tooling — one tool, not four.** These are alternative ways to reach the same
PostgreSQL database; the project uses the first row and must not mix in another
ORM, or two clients would fight over one schema.

| Package | Database tool | In this project |
|---------|---------------|-----------------|
| `prisma` + `@prisma/client` | Prisma ORM | **Installed and used** — `prisma/schema.prisma`, `src/lib/db.ts`, every API route |
| `drizzle-orm` + `drizzle-kit` | Drizzle ORM | Not installed (Prisma alternative) |
| `pg` | Node.js PostgreSQL driver | Not installed (Prisma ships its own engine) |
| `sequelize` | Sequelize ORM | Not installed (Prisma alternative) |

**Hosting — two separate things.** Vercel runs the Next.js app; Neon hosts the
PostgreSQL database. They are linked by a single variable, `DATABASE_URL`,
which points at Neon and is set in Vercel → Settings → Environment Variables
(and in `.env` for local work). `vercel.json` runs `prisma generate` and
`prisma db push` during the build, so the deployed app always has its tables.

1. Create a project at https://console.neon.tech (free plan, no card) and copy
   its connection string from **Connection Details**.
2. Set `DATABASE_URL` to that string (`?sslmode=require`), locally in `.env` and
   on the host (Vercel → Settings → Environment Variables).
3. Create the schema: `npx prisma db push`. On Vercel nothing manual is
   needed — `vercel.json` builds with `prisma generate && prisma db push && next
   build`, so the first deploy creates the tables and later deploys only apply
   schema changes (`db push` refuses destructive changes rather than dropping
   data).
4. Load data — pick one:
   - `npm run db:dump-sqlite` exports the rows from the local `prisma/dev.db`
     into `prisma/dev-data.sql`; run that file with `psql "$DATABASE_URL" -f
     prisma/dev-data.sql` (ids and password hashes are preserved verbatim);
   - `npm run db:seed-demo` for the demo school;
   - `npm run db:migrate:legacy -- --from data/db.json` for a legacy JSON export.

Use Neon's **direct** (non-pooled) hostname for `DATABASE_URL`: `prisma db push`
and the migration scripts do not work through the transaction pooler. If you
later need pooling, point `url` at the `-pooler` host with `?pgbouncer=true`.

## Deploying for a school

1. Node 18.18+ on a small Linux VM (or any Node host).
2. `npm install && npx prisma db push && npm run build`
3. `DATABASE_URL="postgresql://…" PORT=3000 npm start` behind nginx or a
   process manager (systemd/pm2), or deploy `vercel.json` + Neon (above).
4. Back up the database — `pg_dump` against Neon, or rely on Neon's restore
   window / branching.
5. Log in as admin → Academic Years, Teachers, School Settings.

## Tests

```bash
npm run typecheck             # strict TypeScript
npm run build                 # production build
npm run smoke                 # boots the built server on a temp DB, runs 50 API checks
```
