import { z } from "zod";
import { parseAmountInput } from "./money";

/** Accepts "1,200.50", "M50", 50 → integer cents. */
export const amountCents = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const c = parseAmountInput(v);
    if (c === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please enter a valid amount greater than zero." });
      return z.NEVER;
    }
    return c;
  });

export const id = z.string().min(6).max(40);

export const internalTransferSchema = z.object({ fromAccountId: id, toAccountId: id, amount: amountCents });
export const payBeneficiarySchema = z.object({ fromAccountId: id, beneficiaryId: id, amount: amountCents, reference: z.string().max(40).optional() });
export const crossBorderSchema = z.object({
  fromAccountId: id,
  amount: amountCents,
  country: z.string().length(2),
  recipientName: z.string().min(2).max(120),
  bankName: z.string().min(2).max(120).default("Recipient bank"),
  accountNumber: z.string().min(6).max(34),
  swift: z.string().max(11).optional(),
});
export const payBillSchema = z.object({ fromAccountId: id, billerId: id, amount: amountCents, customerRef: z.string().max(40).optional() });
export const airtimeSchema = z.object({
  fromAccountId: id,
  billerId: id,
  amount: amountCents,
  phone: z.string().regex(/^\+?[0-9 ]{8,15}$/, "Please enter a valid phone number."),
});
export const beneficiarySchema = z.object({
  name: z.string().min(2).max(120),
  bankName: z.string().min(2).max(120),
  accountNumber: z.string().min(6).max(40),
  country: z.string().length(2).optional(),
  swift: z.string().max(11).optional(),
  branchCode: z.string().max(20).optional(),
});
export const cardStatusSchema = z.object({ action: z.enum(["freeze", "unfreeze", "block"]) });
export const cardLimitSchema = z.object({ daily: amountCents.optional(), monthly: amountCents.optional() });
export const orderCardSchema = z.object({
  kind: z.enum(["DEBIT", "CRYPTO"]),
  accountId: id.optional(),
  form: z.enum(["VIRTUAL", "PHYSICAL"]),
  deliveryAddress: z.string().max(300).optional(),
  replacesCardId: id.optional(),
});
export const scheduledSchema = z.object({
  fromAccountId: id,
  beneficiaryId: id.optional(),
  billerId: id.optional(),
  amount: amountCents,
  frequency: z.enum(["ONCE", "WEEKLY", "MONTHLY", "QUARTERLY"]),
  startDate: z.coerce.date(),
  reference: z.string().max(60).optional(),
});
export const profileSchema = z.object({
  preferredLanguage: z.enum(["en", "st", "zu"]).optional(),
  preferredTheme: z.enum(["dark", "light"]).optional(),
  phone: z.string().max(30).optional(),
});
export const registerSchema = z.object({
  firstName: z.string().trim().min(1, "Please enter your first name.").max(100),
  lastName: z.string().trim().min(1, "Please enter your last name.").max(100),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  phone: z.string().trim().max(30).optional(),
  password: z
    .string()
    .min(10, "Use at least 10 characters for your password.")
    .max(200)
    .regex(/[A-Za-z]/, "Your password needs at least one letter.")
    .regex(/[0-9]/, "Your password needs at least one number."),
});
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  password: z.string().min(1, "Please enter your password.").max(200),
});
