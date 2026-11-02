#!/usr/bin/env node
/*
 * Create a Platform Super Admin from the command line.
 *
 *   npm run sa:create -- --name "Platform Owner" --email owner@example.com
 *   npm run sa:create -- --email owner@example.com --password "TempPass123" --reset
 *
 * The super admin is stored in PlatformAdmin — completely separate from the
 * school `User` table, so no school registration or profile path can ever
 * grant platform access. Passwords are hashed with the same scrypt scheme as
 * the rest of the app and are never echoed back or stored in plain text.
 */

import crypto from "node:crypto";
import process from "node:process";
import readline from "node:readline/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function usage() {
  console.log(
    [
      "Usage: npm run sa:create -- [options]",
      "",
      "Options:",
      "  --name <name>        Display name (prompted when omitted)",
      "  --email <email>      Sign-in email (prompted when omitted)",
      "  --password <pass>    Temporary password (prompted when omitted)",
      "  --reset              Reset the password of an existing super admin",
      "  --keep-password      Do not force a password change at first sign-in",
      "  --help               Show this help",
      "",
      "Environment alternative: SUPERADMIN_NAME, SUPERADMIN_EMAIL,",
      "SUPERADMIN_PASSWORD, and SUPERADMIN_RESET=1.",
    ].join("\n")
  );
}

function argValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : "";
}

function hashPassword(password, salt = crypto.randomBytes(12).toString("hex")) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 32).toString("hex") };
}

function validatePassword(password) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(password)) return "Password must include at least one letter.";
  if (!/\d/.test(password)) return "Password must include at least one number.";
  return "";
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  const reset = args.includes("--reset") || process.env.SUPERADMIN_RESET === "1";
  const keepPassword = args.includes("--keep-password");
  let name = argValue(args, "--name") || process.env.SUPERADMIN_NAME || "";
  let email = (argValue(args, "--email") || process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();
  let password = argValue(args, "--password") || process.env.SUPERADMIN_PASSWORD || "";

  const interactive = process.stdin.isTTY && (!name || !email || !password);
  const rl = interactive
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;

  try {
    if (!name && rl) name = (await rl.question("Full name: ")).trim();
    if (!email && rl) email = (await rl.question("Email address: ")).trim().toLowerCase();

    if (!name) name = "Platform Administrator";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("A valid email address is required (use --email or SUPERADMIN_EMAIL).");
    }

    if (!password && rl) {
      password = await rl.question("Temporary password: ");
    }
    if (!password) {
      throw new Error(
        "A password is required (use --password or SUPERADMIN_PASSWORD), or run the command in an interactive terminal."
      );
    }

    const passwordError = validatePassword(password);
    if (passwordError) throw new Error(passwordError);

    const existing = await prisma.platformAdmin.findUnique({ where: { email } });
    if (existing && !reset) {
      throw new Error(
        `A super admin with ${email} already exists. Re-run with --reset to set a new password.`
      );
    }

    const { salt, hash } = hashPassword(password);
    if (existing) {
      await prisma.platformAdmin.update({
        where: { id: existing.id },
        data: {
          name: name.slice(0, 80) || existing.name,
          salt,
          passwordHash: hash,
          status: "active",
          mustChangePassword: keepPassword ? existing.mustChangePassword : true,
        },
      });
      await prisma.platformSession.deleteMany({ where: { adminId: existing.id } });
      console.log(`✓ Password reset for super admin ${email}. Existing platform sessions were revoked.`);
    } else {
      const admin = await prisma.platformAdmin.create({
        data: {
          id: "padmin_" + crypto.randomUUID().slice(0, 12),
          name: name.slice(0, 80),
          email,
          salt,
          passwordHash: hash,
          status: "active",
          mfaEnabled: false,
          mfaSecret: "",
          mustChangePassword: !keepPassword,
        },
      });
      console.log(`✓ Super admin created: ${admin.name} <${admin.email}>`);
    }

    console.log("  Sign in at /super-admin/login");
    if (!keepPassword) {
      console.log("  A password change is required at first sign-in.");
    }
    console.log("  The password is not printed. Store it in a password manager.");
  } finally {
    rl?.close();
  }
}

main()
  .catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
