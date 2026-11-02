import { RecoverForm } from "./recover-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reset your password · LessonHub",
};

export default async function RecoverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <RecoverForm token={token} />;
}
