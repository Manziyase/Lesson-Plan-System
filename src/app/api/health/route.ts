export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, app: "ireme-next", version: 1, time: new Date().toISOString() });
}
