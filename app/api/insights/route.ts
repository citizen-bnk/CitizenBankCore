import { authed } from "@/lib/api";
import { spendingInsights } from "@/lib/banking";
export const dynamic = "force-dynamic";
export const GET = authed(async (_req, s) => spendingInsights(s.userId));
