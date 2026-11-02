import { NextResponse, type NextRequest } from "next/server";

/**
 * CSRF defence for cookie-authenticated API calls: state-changing requests must
 * come from one of our own frontends. Browsers always send Origin on
 * cross-site POST/PATCH/DELETE, so a missing Origin means a non-browser client.
 */
export function middleware(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") {
    if (!req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.redirect("https://citizenbank.co.ls", 307);
    }
    if (!["/api/provider", "/api/health"].includes(req.nextUrl.pathname)) return NextResponse.json({
      code: "LEGACY_BANKING_UNAVAILABLE",
      error: "This service handles CitizenAI provider requests only. Open Citizen Bank through the website or banking app.",
      recovery: "https://citizenbank.co.ls",
    }, { status: 410 });
  }
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/cron/")) return NextResponse.next();
  const origin = req.headers.get("origin");
  if (!origin) return NextResponse.next();
  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost = "";
  try { originHost = new URL(origin).host; } catch { /* invalid */ }
  if (originHost === host || allowed.includes(origin) || process.env.NODE_ENV !== "production") return NextResponse.next();
  return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
}

export const config = { matcher: ["/api/:path*", "/((?!_next/|favicon.ico).*)"] };
