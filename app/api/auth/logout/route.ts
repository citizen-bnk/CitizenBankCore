import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { assertOrigin } from '@/lib/passkey-auth';
import { errorResponse } from '@/lib/api';
export async function POST(req:Request) {
  try {assertOrigin(req);await clearSessionCookie();
  return NextResponse.json({ ok: true });}catch(e){return errorResponse(e);}
}
