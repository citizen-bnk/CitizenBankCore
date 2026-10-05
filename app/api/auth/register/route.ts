import { NextResponse } from "next/server";
import { body, errorResponse } from "@/lib/api";
import { registerSchema } from "@/lib/validators";
import { openCustomer } from "@/lib/onboarding";
import { setSessionCookie } from "@/lib/auth";

import { assertOrigin } from '@/lib/passkey-auth';
import { rateLimit } from '@/lib/rate-limit';
import { submitKyc } from '@/lib/kyc';
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    await rateLimit(req,'registration',5,3600_000);
    if (process.env.ALLOW_REGISTRATION === "false") {
      return NextResponse.json({ error: "Online registration isn't open yet." }, { status: 403 });
    }
    const input = await body(req, registerSchema);

    const user = await openCustomer({ ...input, limited: true });
    await submitKyc(user.id,{legalName:`${input.firstName} ${input.lastName}`,email:input.email,...(input.phone?{phone:input.phone.replaceAll(' ','')}: {})});
    await setSessionCookie({ userId: user.id, roles: user.roles });
    return NextResponse.json({ ok: true, limited: true, user: { firstName: user.firstName } }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
