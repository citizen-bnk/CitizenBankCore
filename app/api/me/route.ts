import { headers } from "next/headers";
import { authed, body } from "@/lib/api";
import { getOverview, updateProfile } from "@/lib/banking";
import { localeForCountry } from "@/lib/currency";
import { profileSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/** Everything a client needs to render the home screens in one round trip. */
export const GET = authed(async (req, s) => {
  const h = await headers();
  const qCountry = new URL(req.url).searchParams.get("country");
  const country = h.get("x-vercel-ip-country") || h.get("x-cb-country") || qCountry;
  return { ...(await getOverview(s.userId)), locale: localeForCountry(country) };
});

export const PATCH = authed(async (req, s) => {
  await updateProfile(s.userId, await body(req, profileSchema));
  return { ok: true };
});
