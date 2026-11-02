import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { SuperAdminLogin } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Super Admin — LessonHub",
};

export default async function SuperAdminLoginPage() {
  const admin = await getPlatformAdmin();
  if (admin) redirect("/super-admin/dashboard");
  return <SuperAdminLogin />;
}
