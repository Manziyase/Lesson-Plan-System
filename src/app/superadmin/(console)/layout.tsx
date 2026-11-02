import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { getPlatformSettings } from "@/lib/platform";
import { ToastProvider, ConfirmProvider } from "@/components/ui";
import { SuperAdminShell } from "@/components/superadmin/shell";

export const dynamic = "force-dynamic";

export default async function SuperAdminConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/superadmin/login");
  const settings = await getPlatformSettings();

  return (
    <ToastProvider>
      <ConfirmProvider>
        <SuperAdminShell
          admin={{
            id: admin.id,
            name: admin.name,
            email: admin.email,
            status: admin.status,
            mfaEnabled: admin.mfaEnabled,
            mustChangePassword: admin.mustChangePassword,
            lastLoginAt: admin.lastLoginAt ? admin.lastLoginAt.toISOString() : null,
            createdAt: admin.createdAt.toISOString(),
          }}
          platformName={settings.name}
        >
          {children}
        </SuperAdminShell>
      </ConfirmProvider>
    </ToastProvider>
  );
}
