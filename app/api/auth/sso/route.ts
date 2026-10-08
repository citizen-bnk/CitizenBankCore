import { NextResponse } from "next/server";
import { z } from "zod";
import { setSessionCookie } from "@/lib/auth";
import { body, errorResponse } from "@/lib/api";
import { BankError } from "@/lib/errors";
import { consumeToken, readSsoConfig, remoteKeys, userForHandoff, verifyHandoff } from "@/lib/sso";
import { withDataScope } from "@/lib/execution-context";

/**
 * Starts a Core session from a one-time handoff token issued by the Citizen Bank website.
 * Called by the banking frontends' /sso route, which forwards the Set-Cookie to the browser.
 */
export async function POST(req: Request) {
  try {
    const cfg = readSsoConfig();
    if (!cfg) {
      return NextResponse.json({ error: "Single sign-on is not set up on this server.", code: "SSO_NOT_CONFIGURED" }, { status: 503 });
    }
    const { code } = await body(req, z.object({ code: z.string().min(20).max(4096) }));
    const claims = await verifyHandoff(code, cfg, remoteKeys(cfg.jwksUrl));
    return await withDataScope(claims.scope ?? "live", async () => {
    if (!(await consumeToken(claims))) {
      throw new BankError("SSO_REPLAY", "This sign-in link has already been used. Please start again from the Citizen Bank website.", 401);
    }
    const user = await userForHandoff(claims);
    await setSessionCookie({ userId: user.id, roles: user.roles });
    return NextResponse.json({
      ok: true,
      user: { firstName: user.firstName, preferredLanguage: user.preferredLanguage, preferredTheme: user.preferredTheme },
    });
    });
  } catch (e) {
    return errorResponse(e);
  }
}
