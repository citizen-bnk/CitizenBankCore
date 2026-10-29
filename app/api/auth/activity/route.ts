import { authed } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth";

/** Only real browser interaction calls this; background data polling never extends the idle window. */
export const POST = authed(async (_req, session) => {
  await setSessionCookie(session);
  return { ok: true };
});
