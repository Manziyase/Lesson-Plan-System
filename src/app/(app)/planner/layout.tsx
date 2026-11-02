import { redirect } from "next/navigation";
import { getPlatformSettings } from "@/lib/platform";

export const dynamic = "force-dynamic";

/** The platform operator can withdraw the planner from every school. */
export default async function PlannerLayout({ children }: { children: React.ReactNode }) {
  const settings = await getPlatformSettings();
  if (!settings.features.planner) redirect("/dashboard");
  return <>{children}</>;
}
