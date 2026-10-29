export type PromptContext = "general" | "loans" | "insurance" | "investing" | "trading";
export type PromptState = { day: string; answered: number; deferred: boolean; suppressed?: string[] };
export type PromptProfile = Record<string, string> & { phone?: string | null };

export const PROFILE_QUESTIONS = [
  { field: "phone", context: "general", question: "What mobile number can we reach you on?", hint: "+266 5XXX XXXX", purpose: "Account contact and security notices" },
  { field: "employmentStatus", context: "general", question: "What is your employment status?", hint: "Full-time, part-time, self-employed, student, retired or not employed", purpose: "Future product eligibility" },
  { field: "employerName", context: "loans", question: "Who is your employer?", hint: "For example, ABC Ltd", purpose: "Loan application", when: (p: PromptProfile) => ["full-time", "part-time"].includes(p.employmentStatus?.toLowerCase() ?? "") },
  { field: "businessActivity", context: "loans", question: "What does your business do?", hint: "For example, retail trading", purpose: "Self-employed loan application", when: (p: PromptProfile) => p.employmentStatus?.toLowerCase() === "self-employed" },
  { field: "incomeRange", context: "loans", question: "Which monthly income range best fits you?", hint: "For example, M5,000–M10,000", purpose: "Loan affordability preparation" },
  { field: "dependants", context: "insurance", question: "How many people depend on your income?", hint: "For example, 2", purpose: "Insurance needs assessment" },
  { field: "investmentExperience", context: "investing", question: "Have you invested before?", hint: "New, some experience or experienced", purpose: "Investment suitability" },
  { field: "riskPreference", context: "trading", question: "How much investment risk are you comfortable with?", hint: "Low, medium or high", purpose: "Trading suitability" },
] as const;

export function localDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Maseru", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function questionFor(profile: PromptProfile, state: PromptState, context: PromptContext, day = localDay()) {
  if (state.day === day && (state.answered >= 2 || state.deferred)) return null;
  return PROFILE_QUESTIONS.find((item) =>
    (item.context === "general" || item.context === context) &&
    !state.suppressed?.includes(item.field) &&
    !String(profile[item.field] ?? "").trim() &&
    (!("when" in item) || item.when(profile)),
  ) ?? null;
}

export function validateProfileAnswer(field: string, value: string) {
  const v = value.trim();
  if (!v || v.length > 150) return "Please enter a short answer.";
  if (field === "phone" && !/^\+?[0-9 ()-]{8,20}$/.test(v)) return "Enter a valid mobile number, including the country code if possible.";
  if (field === "employmentStatus" && !["full-time", "part-time", "self-employed", "student", "retired", "not employed"].includes(v.toLowerCase()))
    return "Choose full-time, part-time, self-employed, student, retired or not employed.";
  if (field === "dependants" && (!/^\d{1,2}$/.test(v) || Number(v) > 30)) return "Enter a number from 0 to 30.";
  return null;
}
