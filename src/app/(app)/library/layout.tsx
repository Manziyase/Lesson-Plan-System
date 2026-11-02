import { redirect } from "next/navigation";
import { getPlatformSettings } from "@/lib/platform";

export const dynamic = "force-dynamic";

/** The platform operator can withdraw the lesson library from every school. */
export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  const settings = await getPlatformSettings();
  if (!settings.features.lessonLibrary) redirect("/dashboard");
  return <>{children}</>;
}
