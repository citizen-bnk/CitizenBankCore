import { NextResponse } from "next/server";
import { body, errorResponse } from "@/lib/api";
import { registerSchema } from "@/lib/validators";
import { openCustomer } from "@/lib/onboarding";
import { setSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    if (process.env.ALLOW_REGISTRATION === "false") {
      return NextResponse.json({ error: "Online registration isn't open yet." }, { status: 403 });
    }
    const input = await body(req, registerSchema);
    const demo = process.env.DEMO_MODE === "true";
    const user = await openCustomer({ ...input, openingDepositCents: demo ? 500_000 : 0 });
    await setSessionCookie({ userId: user.id, roles: user.roles });
    return NextResponse.json({ ok: true, user: { firstName: user.firstName } }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
