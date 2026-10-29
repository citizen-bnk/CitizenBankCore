/** Progressive data collection; these are product gates, not statutory transaction limits. */
export const KYC_FIELDS = {
  basic: ["dateOfBirth", "residentialAddress", "occupation", "idType", "idNumber"],
  standard: ["idEvidenceReference", "addressEvidenceReference", "sourceOfFunds"],
  enhanced: ["pepDeclaration", "taxResidence", "beneficialOwnershipDeclaration"],
} as const;

export type KycStage = keyof typeof KYC_FIELDS;
export type KycAction = "view" | "invest" | "activate_account" | "card" | "transfer" | "high_value" | "cross_border" | "board_appointment";

export const ACTION_STAGE: Record<KycAction, KycStage | null> = {
  view: null,
  invest: "basic",
  activate_account: "standard",
  card: "standard",
  transfer: "standard",
  high_value: "enhanced",
  cross_border: "enhanced",
  board_appointment: "enhanced",
};

export function missingForStage(profile: Record<string, string>, stage: KycStage) {
  const required = stage === "basic" ? KYC_FIELDS.basic
    : stage === "standard" ? [...KYC_FIELDS.basic, ...KYC_FIELDS.standard]
    : [...KYC_FIELDS.basic, ...KYC_FIELDS.standard, ...KYC_FIELDS.enhanced];
  return required.filter((field) => !profile[field]?.trim());
}

export function kycGate(action: KycAction, profile: Record<string, string>, status: string) {
  const stage = ACTION_STAGE[action];
  if (!stage) return { allowed: true, stage: null, missing: [] as string[] };
  const missing = missingForStage(profile, stage);
  // A complete form is still self-declared; an officer must review evidence.
  const needsApproval = stage !== "basic";
  return { allowed: missing.length === 0 && (!needsApproval || status === "APPROVED"), stage, missing };
}
