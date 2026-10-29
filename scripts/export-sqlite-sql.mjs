#!/usr/bin/env node
/*
 * One-off exporter: local SQLite database (prisma/dev.db) → PostgreSQL SQL.
 *
 * The datasource is now PostgreSQL, but every row this project ever wrote is
 * still sitting in the SQLite file. This script reads that file (read-only)
 * and writes prisma/dev-data.sql: plain INSERT statements you can paste into
 * the Neon SQL editor (or run with psql) against the schema created by
 * prisma/schema.sql.
 *
 *   npm run db:dump-sqlite          # writes prisma/dev-data.sql
 *   npm run db:dump-sqlite -- --out other.sql
 *
 * Notes:
 *   - Password hashes (salt + passwordHash) are copied verbatim, so migrated
 *     users log in with their existing passwords.
 *   - Ids are preserved verbatim; nothing is regenerated.
 *   - Column types come from PRAGMA table_info, so BOOLEAN becomes true/false,
 *     DATETIME becomes a UTC timestamp literal and INTEGER stays numeric —
 *     whether Prisma stored timestamps as epoch milliseconds or ISO text.
 *   - Needs Node 22.5+ for the built-in node:sqlite module. On an older Node:
 *       npx -y node@22 scripts/export-sqlite-sql.mjs
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const argOut = (() => {
  const i = process.argv.indexOf("--out");
  return i > -1 ? process.argv[i + 1] : null;
})();
const SRC = (() => {
  const i = process.argv.indexOf("--from");
  return i > -1 ? path.resolve(process.argv[i + 1]) : path.resolve(__dirname, "..", "prisma", "dev.db");
})();
const OUT = argOut
  ? path.resolve(argOut)
  : path.resolve(__dirname, "..", "prisma", "dev-data.sql");

// Parents before children so foreign keys are satisfied.
const TABLES = [
  "Meta",
  "School",
  "Class",
  "LearningArea",
  "User",
  "AcademicYear",
  "Plan",
  "PlanRow",
  "Lesson",
  "Session",
];

let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  console.error(`node:sqlite is not available on ${process.version} (needs Node 22.5+).`);
  console.error("Run it with a newer Node instead:");
  console.error("  npx -y node@22 scripts/export-sqlite-sql.mjs");
  process.exit(1);
}

if (!fs.existsSync(SRC)) {
  console.error(`SQLite database not found at ${SRC}`);
  console.error("Pass --from /path/to/dev.db if it lives elsewhere.");
  process.exit(1);
}

const db = new DatabaseSync(SRC, { readOnly: true });

function literal(declaredType, value) {
  if (value === null || value === undefined) return "NULL";
  const t = String(declaredType || "").toUpperCase();

  if (t.includes("BOOL")) return value ? "true" : "false";

  if (t.includes("DATE") || t.includes("TIME")) {
    const d = typeof value === "number" ? new Date(value) : new Date(String(value));
    if (Number.isNaN(d.getTime())) return quote(String(value));
    // Explicit offset; the column is timestamp(3) without time zone, so this
    // lands as the same UTC wall-clock value Prisma would write.
    return quote(d.toISOString().replace("T", " ").replace("Z", "+00"));
  }

  if (t.includes("INT") || t.includes("REAL") || t.includes("NUM") || t.includes("DEC")) {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : quote(String(value));
  }

  return quote(String(value));
}

function quote(s) {
  return "'" + s.replace(/'/g, "''") + "'";
}

const out = [];
const counts = {};

out.push("-- Ireme — data exported from the local SQLite database (prisma/dev.db).");
out.push("-- Run AFTER prisma/schema.sql, against an empty database.");
out.push(`-- Generated: ${new Date().toISOString()}`);
out.push("");
out.push("BEGIN;");
out.push("");

for (const table of TABLES) {
  let exists;
  try {
    exists = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(table);
  } catch (err) {
    console.error(`Could not read the SQLite file: ${err.message}`);
    process.exit(1);
  }
  if (!exists) {
    counts[table] = 0;
    continue;
  }

  const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
  const columnList = cols.map((c) => `"${c.name}"`).join(", ");
  const rows = db.prepare(`SELECT * FROM "${table}"`).all();
  counts[table] = rows.length;

  if (rows.length === 0) continue;

  out.push(`-- ${table}: ${rows.length} row(s)`);
  for (const row of rows) {
    const values = cols.map((c) => literal(c.type, row[c.name])).join(", ");
    out.push(`INSERT INTO "${table}" (${columnList}) VALUES (${values});`);
  }
  out.push("");
}

out.push("COMMIT;");
out.push("");

fs.writeFileSync(OUT, out.join("\n"), "utf8");

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`Source: ${SRC}`);
console.log(`Wrote:  ${OUT}`);
for (const [table, n] of Object.entries(counts)) {
  console.log(`  ${table.padEnd(14)} ${n}`);
}
console.log(`Total rows: ${total}`);
if (total === 0) {
  console.log("\nThe local database is empty — nothing to migrate. Use npm run db:seed-demo");
  console.log("against Neon instead, or create your school through /signup.");
}
