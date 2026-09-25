import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { getSession, type Session } from "./auth";
import { BankError } from "./errors";

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: requires a session, maps domain/validation errors to JSON. */
export function authed<P = Record<string, string>>(
  handler: (req: Request, session: Session, ctx: Ctx<P>) => Promise<unknown>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Please sign in again.", code: "UNAUTHENTICATED" }, { status: 401 });
    try {
      const out = await handler(req, session, ctx);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof BankError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return NextResponse.json({ error: first?.message ?? "Invalid request", code: "VALIDATION" }, { status: 422 });
  }
  console.error("[api] unexpected error", e);
  return NextResponse.json({ error: "Something went wrong on our side. Please try again.", code: "INTERNAL" }, { status: 500 });
}

export async function body<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new BankError("BAD_JSON", "Invalid request body.");
  }
  return schema.parse(json);
}

/**
 * Reads the optional Idempotency-Key header. A malformed key is rejected rather than
 * ignored: ignoring it would silently drop the client's double-payment protection.
 */
export function idempotencyKey(req: Request) {
  const k = req.headers.get("idempotency-key");
  if (k === null) return undefined;
  if (!/^[A-Za-z0-9:_-]{8,80}$/.test(k)) {
    throw new BankError(
      "BAD_IDEMPOTENCY_KEY",
      "Idempotency-Key must be 8–80 characters of letters, digits, colon, underscore or hyphen.",
    );
  }
  return k;
}
