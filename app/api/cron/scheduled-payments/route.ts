import { runDueScheduledPayments } from "@/lib/banking";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Invoked daily by Vercel Cron (see vercel.json). Protected by CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await runDueScheduledPayments();
  return Response.json({ ran: results.length, failed: results.filter((r) => !r.ok).length, results });
}
