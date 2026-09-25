import { randomBytes } from "node:crypto";

/** Short, URL-safe, time-sortable id (timestamp prefix + 10 random chars). */
export function createId(): string {
  return Date.now().toString(36) + randomBytes(8).toString("base64url").slice(0, 10);
}

/** Human-friendly transaction reference, e.g. CB2609-7KQ4XM2P. */
export function createReference(): string {
  const d = new Date();
  const yymm = String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, "0");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `CB${yymm}-${s}`;
}
