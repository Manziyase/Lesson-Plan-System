#!/usr/bin/env node
/*
 * Seeds the demo school (GS Kanyinya) into the Next.js database — only when
 * the database is empty. Same shape as the legacy seed: 7 staff, two
 * academic years, daily plans across teachers/terms/years.
 *
 * Run: npm run db:seed-demo (after prisma db push)
 */

import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();
const NOW = new Date();

function hashPassword(password) {
  const salt = crypto.randomBytes(12).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");
  return { salt, hash };
}

function extractUnit(text) {
  return String(text ?? "").split(/[\n;•]+/).map((s) => s.trim()).filter(Boolean)[0] ?? "";
}

async function main() {
  if ((await prisma.school.count()) > 0) {
    console.log("Database already has data — seeding skipped.");
    return;
  }

  const school = await prisma.school.create({
    data: {
      id: "school_demo",
      name: "GS Kanyinya",
      district: "Nyarugenge",
      sector: "Kanyinya",
      levels: JSON.stringify(["N1", "N2", "N3", "P1", "P2", "P3", "P4", "P5", "P6"]),
    },
  });
  const classDefs = [
    ["c-n1", "Nursery 1", "N1"], ["c-n2", "Nursery 2", "N2"], ["c-n3", "Nursery 3", "N3"],
    ["c-p1", "P1", "P1"], ["c-p2", "P2", "P2"], ["c-p3", "P3", "P3"],
    ["c-p4", "P4", "P4"], ["c-p5", "P5", "P5"], ["c-p6", "P6", "P6"],
  ];
  await prisma.class.createMany({ data: classDefs.map(([id, name, level]) => ({ id, schoolId: school.id, name, level, stream: null })) });
  const areaDefs = [
    ["a-math", "Mathematics"], ["a-eng", "English"], ["a-kiny", "Kinyarwanda"],
    ["a-sci", "Science & Elementary Technology"], ["a-soc", "Social & Religious Studies"],
    ["a-entre", "Entrepreneurship"], ["a-ict", "ICT"], ["a-phy", "Physical Education & Sports"],
  ];
  await prisma.learningArea.createMany({ data: areaDefs.map(([id, name]) => ({ id, schoolId: school.id, name })) });

  const staff = [
    ["Aline Uwase", "admin@school.rw", "admin", ["Mathematics"], ["P5"]],
    ["Jean Bosco Nsengimana", "jean@school.rw", "teacher", ["Mathematics"], ["P5", "P6", "P4"]],
    ["Claudine Mukamana", "claudine@school.rw", "teacher", ["English"], ["P4", "P1", "P3"]],
    ["Emmanuel Habimana", "emmanuel@school.rw", "teacher", ["Kinyarwanda"], ["P2", "P3", "P1"]],
    ["Diane Ingabire", "diane@school.rw", "teacher", ["Science & Elementary Technology", "Physical Education & Sports"], ["P6", "P5", "P4"]],
    ["Fabrice Niyonkuru", "fabrice@school.rw", "teacher", ["Social & Religious Studies", "Entrepreneurship"], ["P4", "P3", "P6"]],
    ["Sandrine Nyirahabimana", "sandrine@school.rw", "teacher", ["ICT"], ["P5", "P6"]],
  ];
  const users = {};
  for (const [name, email, role, subjects, classes] of staff) {
    const { salt, hash } = hashPassword("changeme123");
    users[email] = await prisma.user.create({
      data: {
        schoolId: school.id, name, email, role, salt, passwordHash: hash,
        subjects: JSON.stringify(subjects), classes: JSON.stringify(classes), mustChangePassword: false,
      },
    });
  }

  const y2025 = await prisma.academicYear.create({
    data: { id: "year_2025", schoolId: school.id, label: "2025-2026", startDate: "2025-09-08", endDate: "2026-07-03", terms: JSON.stringify([1, 2, 3]), isActive: false },
  });
  const y2026 = await prisma.academicYear.create({
    data: { id: "year_2026", schoolId: school.id, label: "2026-2027", startDate: "2026-09-07", endDate: "2027-07-02", terms: JSON.stringify([1, 2, 3]), isActive: true },
  });
  await prisma.user.update({ where: { id: users["admin@school.rw"].id }, data: { activeYearId: y2026.id } });

  const row = (time, classId, className, areaId, area, competence, procedure) =>
    ({ time, classId, className, learningAreaId: areaId, learningArea: area, competence, procedure });
  const plans = [
    {
      id: "plan_demo1", teacher: "jean@school.rw", year: y2025, term: 1, date: "2025-09-08",
      rows: [
        row("08:00-08:40", "c-p5", "P5", "a-math", "Mathematics", "Unit 5: Multiplication of whole numbers\nSubUnit 5.2 Multiplying by 10 and 100", "Introduction\n- Write 34 x 10 on the board; pupils solve in pairs.\n\nDevelopment\n- Pupils use place-value cards to show 34 x 10 = 340.\n- Guided examples: 27 x 100, 45 x 10.\n\nAssessment\n- Exercises 5.2, questions 1-6."),
        row("08:40-09:20", "c-p6", "P6", "a-math", "Mathematics", "Unit 5: Multiplication of whole numbers\nSubUnit 5.2 Multiplying by 10 and 100", "Introduction\n- Review of the previous lesson: multiplication tables.\n\nDevelopment\n- Demonstrate pattern: 6 x 10 = 60, 6 x 100 = 600.\n- Pair work: pupils complete a pattern table.\n\nAssessment\n- Short oral quiz on 8 examples."),
        row("10:40-11:20", "c-p4", "P4", "a-math", "Mathematics", "Unit 3: Addition and subtraction of whole numbers\nSubUnit 3.2 Adding with carrying", "- Recap: place value of numbers up to 1000.\n- Board example: 345 + 278 with carrying.\n- Pair work: 6 exercises in books.\n- Assessment: exercise 3.2, questions 1-4."),
      ],
    },
    {
      id: "plan_demo2", teacher: "claudine@school.rw", year: y2025, term: 1, date: "2025-09-09",
      rows: [
        row("08:00-08:40", "c-p4", "P4", "a-eng", "English", "Unit 1: Greetings and polite expressions", '- Song: "Good morning" to settle the class.\n- Flashcards: greeting pairs, pupils match.\n- Role-play in pairs.\n- Assessment: pupils produce one greeting each.'),
        row("08:40-09:20", "c-p1", "P1", "a-eng", "English", "Unit 1: Greetings and polite expressions", "- Same progression as P4 with more drilling.\n- Role-play: teacher and pupils act a dialogue.\n- Assessment: pair performances."),
        row("11:20-12:00", "c-p3", "P3", "a-eng", "English", "Unit 2: Descriptive texts\nSubUnit 2.1 Adjectives", "- Warm-up: describe your best friend (2 adjectives).\n- Board: adjective order opinion-size-age.\n- Group writing: 5 sentences about the school.\n- Peer correction using a checklist."),
      ],
    },
    {
      id: "plan_demo3", teacher: "jean@school.rw", year: y2026, term: 1, date: "2026-09-07",
      rows: [
        row("08:00-08:40", "c-p5", "P5", "a-math", "Mathematics", "Unit 5: Multiplication of whole numbers\nSubUnit 5.2 Multiplying by 10 and 100", "- Review place value with the new class.\n- Pattern: 3 x 10 = 30, 3 x 100 = 300.\n- Pair practice: 8 examples on the board.\n- Assessment: Exercise 5.2 selected questions."),
        row("10:40-11:20", "c-p4", "P4", "a-math", "Mathematics", "Unit 3: Addition and subtraction of whole numbers\nSubUnit 3.3 Word problems", "- Recap: carrying in addition.\n- Solve two word problems together as a class.\n- Groups create their own word problem from home life.\n- Assessment: group presentations."),
      ],
    },
    {
      id: "plan_demo4", teacher: "diane@school.rw", year: y2026, term: 2, date: "2027-01-11",
      rows: [
        row("08:00-08:40", "c-p6", "P6", "a-sci", "Science & Elementary Technology", "Unit 8: Weather and the environment", "- Weather chart: observe and record today's weather.\n- Discussion: how weather affects farming in Rwanda.\n- Groups: draw the water cycle.\n- Assessment: labelled water-cycle drawing."),
        row("10:40-11:20", "c-p5", "P5", "a-sci", "Science & Elementary Technology", "Unit 8: Weather and the environment", "- Recap of the water cycle.\n- Demo: evaporation with warm water and a glass lid.\n- Groups explain evaporation in own words.\n- Assessment: short written summary."),
      ],
    },
  ];

  let seq = 1000;
  for (const p of plans) {
    const id = p.id;
    await prisma.plan.create({
      data: {
        id,
        schoolId: school.id,
        teacherId: users[p.teacher].id,
        teacherName: users[p.teacher].name,
        academicYearId: p.year.id,
        yearLabel: p.year.label,
        term: p.term,
        date: p.date,
        status: "published",
        rows: {
          create: p.rows.map((r, i) => ({
            id: `${id}_r${i + 1}`,
            position: i + 1,
            ...r,
            levelId: classDefs.find(([cid]) => cid === r.classId)?.[2] ?? "",
          })),
        },
      },
    });
    for (let i = 0; i < p.rows.length; i++) {
      const r = p.rows[i];
      await prisma.lesson.create({
        data: {
          id: `${id}_r${i + 1}`,
          planId: id,
          schoolId: school.id,
          teacherId: users[p.teacher].id,
          teacherName: users[p.teacher].name,
          yearLabel: p.year.label,
          academicYearId: p.year.id,
          term: p.term,
          date: p.date,
          time: r.time,
          classId: r.classId,
          className: r.className,
          learningAreaId: r.learningAreaId,
          learningArea: r.learningArea,
          unit: extractUnit(r.competence),
          competence: r.competence,
          procedure: r.procedure,
        },
      });
    }
    seq++;
  }
  await prisma.meta.create({ data: { key: "seq", value: String(seq) } }).catch(() => {});

  console.log("Seed complete: GS Kanyinya demo school (Next.js database).");
  console.log("  Log in with admin@school.rw or jean@school.rw — password changeme123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
