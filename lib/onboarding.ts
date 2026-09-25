import { eq } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { hashPassword } from "./auth";
import { BankError } from "./errors";
import { postTransaction, systemAccount } from "./ledger";

const PREFIX = { CURRENT: "10", SAVINGS: "20", FIXED_DEPOSIT: "30", INTERNAL: "90" } as const;

/** 10-digit account number: 2-digit product prefix + 7 random digits + Luhn check digit. */
export async function newAccountNumber(tx: Tx | typeof db, type: keyof typeof PREFIX) {
  for (let i = 0; i < 10; i++) {
    const body = PREFIX[type] + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
    const num = body + luhn(body);
    const [exists] = await tx.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.number, num)).limit(1);
    if (!exists) return num;
  }
  throw new Error("Could not allocate an account number");
}

function luhn(s: string) {
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    let d = Number(s[s.length - 1 - i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

export async function openCustomer(input: {
  firstName: string; lastName: string; email: string; phone?: string; password: string; openingDepositCents?: number;
}) {
  const [dup] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, input.email)).limit(1);
  if (dup) throw new BankError("EMAIL_TAKEN", "An account with this email already exists. Try signing in instead.", 409);
  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({
      email: input.email, passwordHash, firstName: input.firstName, lastName: input.lastName, phone: input.phone ?? null,
    }).returning();

    const [current] = await tx.insert(schema.accounts).values({
      userId: user.id, name: "Current Account", type: "CURRENT", number: await newAccountNumber(tx, "CURRENT"),
    }).returning();
    await tx.insert(schema.accounts).values({
      userId: user.id, name: "Savings Account", type: "SAVINGS", number: await newAccountNumber(tx, "SAVINGS"), interestRate: "4.50",
    });
    const exp = new Date(); exp.setFullYear(exp.getFullYear() + 4);
    await tx.insert(schema.cards).values({
      userId: user.id, accountId: current.id, label: "Current", last4: current.number.slice(-4), brand: "VISA",
      kind: "DEBIT", form: "VIRTUAL", expiry: `${String(exp.getMonth() + 1).padStart(2, "0")}/${String(exp.getFullYear()).slice(2)}`,
      dailyLimit: "5000.00", monthlyLimit: "50000.00",
    });

    if (input.openingDepositCents && input.openingDepositCents > 0) {
      const suspense = await systemAccount(tx, "DEMO_FUNDING");
      await postTransaction(tx, {
        type: "DEPOSIT",
        description: "Welcome deposit (demo)",
        amountCents: input.openingDepositCents,
        legs: [
          { accountId: suspense.id, cents: -input.openingDepositCents, narrative: `Demo funding for ${user.email}` },
          { accountId: current.id, cents: input.openingDepositCents, narrative: "Welcome deposit (demo)" },
        ],
      });
    }
    await tx.insert(schema.notifications).values({
      userId: user.id, title: "Welcome to Citizen Bank", body: "Your current and savings accounts are open, and a virtual debit card is ready to use.",
    });
    return user;
  });
}
