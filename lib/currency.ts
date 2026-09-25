/**
 * Location-aware currency display.
 *
 * Citizen Bank books every account in Lesotho maloti (LSL). The loti is pegged
 * 1:1 to the South African rand. When a customer opens the app from outside
 * Lesotho we detect their country (Vercel's x-vercel-ip-country header, falling
 * back to the browser locale on the client) and show an *indicative* equivalent
 * in their local currency next to balances.
 *
 * Rates are indicative only and can be overridden without a redeploy of code via
 * the FX_RATES_JSON env var, e.g. {"USD":0.055,"BWP":0.74}. Wire this to a live
 * FX feed before relying on it for anything other than display.
 */
export const HOME_COUNTRY = "LS";

const COUNTRY_CURRENCY: Record<string, string> = {
  LS: "LSL", ZA: "ZAR", NA: "NAD", SZ: "SZL", BW: "BWP", ZW: "USD", MZ: "MZN", ZM: "ZMW",
  MW: "MWK", TZ: "TZS", KE: "KES", NG: "NGN", GH: "GHS", US: "USD", GB: "GBP", IE: "EUR",
  DE: "EUR", FR: "EUR", NL: "EUR", ES: "EUR", IT: "EUR", PT: "EUR", BE: "EUR", CN: "CNY",
  IN: "INR", AE: "AED", AU: "AUD", CA: "CAD",
};

/** Units of foreign currency per 1 LSL (indicative). */
const DEFAULT_RATES: Record<string, number> = {
  LSL: 1, ZAR: 1, NAD: 1, SZL: 1, // Common Monetary Area — pegged at par
  USD: 0.056, EUR: 0.051, GBP: 0.043, BWP: 0.76, MZN: 3.6, ZMW: 1.5, MWK: 97, TZS: 145,
  KES: 7.2, NGN: 86, GHS: 0.86, CNY: 0.4, INR: 4.8, AED: 0.21, AUD: 0.086, CAD: 0.077,
};

function rates(): Record<string, number> {
  try {
    const extra = process.env.FX_RATES_JSON ? JSON.parse(process.env.FX_RATES_JSON) : {};
    return { ...DEFAULT_RATES, ...extra };
  } catch {
    return DEFAULT_RATES;
  }
}

export type LocaleInfo = {
  country: string;
  localCurrency: string;
  /** null when local currency is LSL or pegged at par (no need to show a second figure). */
  rate: number | null;
};

export function localeForCountry(country: string | null | undefined): LocaleInfo {
  const cc = (country || HOME_COUNTRY).toUpperCase();
  const localCurrency = COUNTRY_CURRENCY[cc] ?? "USD";
  const r = rates()[localCurrency];
  const pegged = ["LSL", "ZAR", "NAD", "SZL"].includes(localCurrency) && cc === HOME_COUNTRY;
  return { country: cc, localCurrency, rate: pegged || localCurrency === "LSL" || !r ? null : r };
}

export const SUPPORTED_COUNTRIES_CROSS_BORDER: { code: string; name: string; currency: string }[] = [
  { code: "ZA", name: "South Africa", currency: "ZAR" },
  { code: "BW", name: "Botswana", currency: "BWP" },
  { code: "SZ", name: "Eswatini", currency: "SZL" },
  { code: "ZW", name: "Zimbabwe", currency: "USD" },
  { code: "MZ", name: "Mozambique", currency: "MZN" },
  { code: "NA", name: "Namibia", currency: "NAD" },
  { code: "ZM", name: "Zambia", currency: "ZMW" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "US", name: "United States", currency: "USD" },
];

export function fxRate(currency: string): number {
  return rates()[currency] ?? 1;
}
