/*
 * Plan input sanitisation — port of the legacy sanitizePlanInput():
 * validates date/term/year, links free-text class names to the school's
 * configured classes, caps field lengths.
 */

import { isValidDate, str, levelOfName, TERMS } from "./util";

export type SanitizedRow = {
  time: string;
  levelId: string;
  classId: string;
  className: string;
  stream: string | null;
  learningAreaId: string;
  learningArea: string;
  subUnit: string;
  competence: string;
  procedure: string;
};

type SchoolClassLike = { id: string; name: string; level?: string | null; stream?: string | null };

export function sanitizePlanInput(
  body: Record<string, unknown>,
  schoolClasses: SchoolClassLike[]
): { errors: string[]; date: string; term: number; yearId: string; rows: SanitizedRow[] } {
  const errors: string[] = [];
  const date = str(body.date);
  if (!isValidDate(date)) errors.push("A valid lesson date (YYYY-MM-DD) is required.");
  const term = parseInt(String(body.term ?? ""), 10);
  if (!TERMS.includes(term as 1 | 2 | 3)) errors.push("Term must be 1, 2 or 3.");
  const yearId = str(body.academicYearId);
  const rowsIn = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];

  const rows = rowsIn.map((r) => {
    /* The class is what the teacher typed — free text. When it matches one of
       the school's configured classes, link it for filtering; otherwise it
       stays as written. */
    let className = str(r.className).slice(0, 60);
    let classId = "";
    let levelId = "";
    let stream: string | null = null;
    /* Match by name first (legacy clients), then by id so a row whose
       descriptive class text ("P3 SET") still maps to the configured class. */
    let matched = className
      ? schoolClasses.find((x) => x.name.toLowerCase() === className.toLowerCase())
      : undefined;
    if (!matched && str(r.classId)) {
      matched = schoolClasses.find((x) => x.id === str(r.classId));
    }
    if (matched) {
      classId = matched.id;
      if (!className) className = matched.name;
      levelId = matched.level || "";
      stream = matched.stream || null;
    } else if (className) {
      levelId = levelOfName(className) || "";
    }
    return {
      time: str(r.time).slice(0, 40),
      levelId: levelId.slice(0, 10),
      classId: classId.slice(0, 40),
      className,
      stream,
      learningAreaId: str(r.learningAreaId).slice(0, 40),
      learningArea: str(r.learningArea).slice(0, 80),
      subUnit: str(r.subUnit).slice(0, 200),
      competence: str(r.competence).slice(0, 2000),
      procedure: str(r.procedure).slice(0, 8000),
    };
  });

  return { errors, date, term, yearId, rows };
}
