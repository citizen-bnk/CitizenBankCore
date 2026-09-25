/**
 * Money helpers. All arithmetic is done in integer cents to avoid float drift;
 * Postgres stores NUMERIC(18,2) which Drizzle hands back as strings.
 */
export const BASE_CURRENCY = "LSL";

export function toCents(v: string | number): number {
  if (typeof v === "number") return Math.round(v * 100);
  const s = v.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid amount: ${v}`);
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2)) + (Number(frac[2] ?? 0) >= 5 ? 1 : 0);
  return neg ? -cents : cents;
}

export function fromCents(c: number): string {
  const neg = c < 0;
  const abs = Math.abs(c);
  return `${neg ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const SYMBOLS: Record<string, string> = { LSL: "M", ZAR: "R", USD: "$", BWP: "P", SZL: "E", EUR: "€", GBP: "£" };

/** "M 24,530.00" — Lesotho convention puts the loti symbol before the amount. */
export function formatMoney(v: string | number, currency = BASE_CURRENCY): string {
  const n = typeof v === "string" ? Number(v) : v;
  const sym = SYMBOLS[currency];
  const body = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!sym) return `${n < 0 ? "-" : ""}${currency} ${body}`;
  return `${n < 0 ? "-" : ""}${sym} ${body}`;
}

/** Parses user input like "M1,200", "1 200.50", "R50" into cents. Returns null if invalid. */
export function parseAmountInput(input: string | number): number | null {
  if (typeof input === "number") return Number.isFinite(input) && input > 0 ? Math.round(input * 100) : null;
  if (/-/.test(input)) return null;
  const cleaned = input.replace(/[^\d.]/g, "");
  if (!cleaned || !/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const cents = toCents(cleaned);
  return cents > 0 ? cents : null;
}
