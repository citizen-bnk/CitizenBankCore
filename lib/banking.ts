/**
 * Banking services shared by the mobile app, internet banking and the AI assistant.
 * Every function takes the authenticated userId and enforces ownership itself —
 * never trust an accountId/cardId coming from the client.
 */
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { BankError, notFound } from "./errors";
import { outboundTodayCents, postTransaction, priorPosting, systemAccount } from "./ledger";
import { formatMoney, fromCents, toCents } from "./money";
import { fxRate, SUPPORTED_COUNTRIES_CROSS_BORDER } from "./currency";

const S = schema;

/* ------------------------------------------------------------------ config */

export const FEES = {
  localTransferCents: Number(process.env.FEE_LOCAL_TRANSFER_CENTS ?? 500), // M5.00
  intlPercent: Number(process.env.FEE_INTL_PERCENT ?? 1), // 1%
  intlMinCents: Number(process.env.FEE_INTL_MIN_CENTS ?? 5000), // M50.00
};
export const DAILY_OUTBOUND_LIMIT_CENTS = Number(process.env.DAILY_TRANSFER_LIMIT_CENTS ?? 5_000_000); // M50,000
export const MAX_CARD_LIMIT_CENTS = 10_000_000; // M100,000

export const LOCAL_BANKS = [
  "Citizen Bank",
  "Standard Lesotho Bank",
  "First National Bank Lesotho",
  "Nedbank Lesotho",
  "Lesotho PostBank",
];

export function feeFor(kind: "CITIZEN" | "LOCAL" | "INTERNATIONAL", cents: number) {
  if (kind === "LOCAL") return FEES.localTransferCents;
  if (kind === "INTERNATIONAL") return Math.max(FEES.intlMinCents, Math.round((cents * FEES.intlPercent) / 100));
  return 0;
}

/* ----------------------------------------------------------------- helpers */

async function ownedAccount(tx: Tx | typeof db, userId: string, accountId: string) {
  const [acc] = await tx
    .select()
    .from(S.accounts)
    .where(and(eq(S.accounts.id, accountId), eq(S.accounts.userId, userId)))
    .limit(1);
  if (!acc) throw notFound("account");
  if (acc.type === "FIXED_DEPOSIT") {
    throw new BankError("FIXED_DEPOSIT", "Money can't be moved out of a fixed deposit before it matures.");
  }
  return acc;
}

async function enforceDailyLimit(tx: Tx, userId: string, cents: number) {
  const used = await outboundTodayCents(tx, userId);
  if (used + cents > DAILY_OUTBOUND_LIMIT_CENTS) {
    const left = Math.max(0, DAILY_OUTBOUND_LIMIT_CENTS - used);
    throw new BankError(
      "DAILY_LIMIT",
      `That would go over your daily payment limit. You can still send ${formatMoney(fromCents(left))} today.`,
    );
  }
}

function assertAmount(cents: number) {
  if (!Number.isInteger(cents) || cents <= 0) throw new BankError("BAD_AMOUNT", "Please enter an amount greater than zero.");
  if (cents > 100_000_000) throw new BankError("BAD_AMOUNT", "That amount is too large for a single payment.");
}

async function notify(tx: Tx, userId: string, title: string, body: string) {
  await tx.insert(S.notifications).values({ userId, title, body });
}

/* --------------------------------------------------------------- overview */

const ACCOUNT_ORDER: Record<string, number> = { CURRENT: 0, SAVINGS: 1, FIXED_DEPOSIT: 2, INTERNAL: 3 };

export async function getOverview(userId: string) {
  const [user] = await db.select().from(S.users).where(eq(S.users.id, userId)).limit(1);
  if (!user) throw notFound("user");
  const [accounts, cards, beneficiaries, billers, scheduled, loans, unread] = await Promise.all([
    db.select().from(S.accounts).where(eq(S.accounts.userId, userId)).orderBy(asc(S.accounts.createdAt)),
    db.select().from(S.cards).where(eq(S.cards.userId, userId)).orderBy(asc(S.cards.createdAt)),
    db.select().from(S.beneficiaries).where(eq(S.beneficiaries.userId, userId))
      .orderBy(sql`${S.beneficiaries.lastPaidAt} DESC NULLS LAST`, asc(S.beneficiaries.name)),
    db.select().from(S.billers).where(eq(S.billers.active, true)).orderBy(asc(S.billers.name)),
    listScheduled(userId),
    db.select().from(S.loans).where(eq(S.loans.userId, userId)),
    db.select({ n: sql<number>`count(*)::int` }).from(S.notifications)
      .where(and(eq(S.notifications.userId, userId), eq(S.notifications.read, false))),
  ]);
  const recent = await listTransactions(userId, { limit: 10 });
  return {
    user: {
      id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone,
      preferredLanguage: user.preferredLanguage, preferredTheme: user.preferredTheme, roles: user.roles,
    },
    accounts: accounts.sort((a, b) => ACCOUNT_ORDER[a.type] - ACCOUNT_ORDER[b.type]).map((a) => ({
      id: a.id, name: a.name, type: a.type, number: a.number, last4: a.number.slice(-4),
      currency: a.currency, balance: a.balance, status: a.status, interestRate: a.interestRate, maturesAt: a.maturesAt,
    })),
    cards: cards.map((c) => ({
      id: c.id, label: c.label, last4: c.last4, brand: c.brand, kind: c.kind, form: c.form, expiry: c.expiry,
      status: c.status, dailyLimit: c.dailyLimit, monthlyLimit: c.monthlyLimit, accountId: c.accountId,
    })),
    beneficiaries: beneficiaries.map((b) => ({
      id: b.id, name: b.name, type: b.type, bankName: b.bankName, accountLast4: b.accountNumber.slice(-4), country: b.country,
    })),
    billers: billers.map((b) => ({ id: b.id, code: b.code, name: b.name, category: b.category, refLabel: b.refLabel, isAirtime: b.isAirtime })),
    scheduled,
    loans: loans.map((l) => ({ ...l })),
    recent,
    unreadNotifications: unread[0]?.n ?? 0,
    fees: FEES,
    localBanks: LOCAL_BANKS,
    crossBorderCountries: SUPPORTED_COUNTRIES_CROSS_BORDER.map((c) => ({ ...c, rate: fxRate(c.currency) })),
    dailyLimit: DAILY_OUTBOUND_LIMIT_CENTS / 100,
  };
}

export async function listTransactions(
  userId: string,
  opts: { accountId?: string; limit?: number; from?: Date; to?: Date } = {},
) {
  const conds = [eq(S.accounts.userId, userId)];
  if (opts.accountId) conds.push(eq(S.ledgerEntries.accountId, opts.accountId));
  if (opts.from) conds.push(gte(S.ledgerEntries.createdAt, opts.from));
  if (opts.to) conds.push(lte(S.ledgerEntries.createdAt, opts.to));
  const rows = await db
    .select({
      id: S.ledgerEntries.id,
      amount: S.ledgerEntries.amount,
      balanceAfter: S.ledgerEntries.balanceAfter,
      narrative: S.ledgerEntries.narrative,
      createdAt: S.ledgerEntries.createdAt,
      accountId: S.ledgerEntries.accountId,
      accountName: S.accounts.name,
      type: S.transactions.type,
      reference: S.transactions.reference,
      status: S.transactions.status,
    })
    .from(S.ledgerEntries)
    .innerJoin(S.accounts, eq(S.accounts.id, S.ledgerEntries.accountId))
    .innerJoin(S.transactions, eq(S.transactions.id, S.ledgerEntries.transactionId))
    .where(and(...conds))
    .orderBy(desc(S.ledgerEntries.createdAt), desc(S.ledgerEntries.id))
    .limit(Math.min(opts.limit ?? 50, 500));
  // Hide the internal leg of a transfer between the user's own accounts from the
  // "recent activity" feed only when no account filter is set? No — show both legs:
  // each is a real movement on a real account, which is what statements need too.
  return rows;
}

/* --------------------------------------------------------------- payments */

export async function internalTransfer(
  userId: string,
  p: { fromAccountId: string; toAccountId: string; cents: number; idempotencyKey?: string },
) {
  assertAmount(p.cents);
  if (p.fromAccountId === p.toAccountId) throw new BankError("SAME_ACCOUNT", "Please choose two different accounts.");
  return db.transaction(async (tx) => {
    const prior = await priorPosting(tx, p.idempotencyKey, userId, { cents: p.cents, accountIds: [p.fromAccountId, p.toAccountId] });
    if (prior) return prior;
    const from = await ownedAccount(tx, userId, p.fromAccountId);
    const [to] = await tx.select().from(S.accounts)
      .where(and(eq(S.accounts.id, p.toAccountId), eq(S.accounts.userId, userId))).limit(1);
    if (!to) throw notFound("account");
    return postTransaction(tx, {
      type: "INTERNAL_TRANSFER",
      description: `Transfer ${from.name} → ${to.name}`,
      amountCents: p.cents,
      legs: [
        { accountId: from.id, cents: -p.cents, narrative: `Transfer to ${to.name}` },
        { accountId: to.id, cents: p.cents, narrative: `Transfer from ${from.name}` },
      ],
      idempotencyKey: p.idempotencyKey,
      initiatedById: userId,
    });
  });
}

export async function payBeneficiary(
  userId: string,
  p: { fromAccountId: string; beneficiaryId: string; cents: number; reference?: string; idempotencyKey?: string },
) {
  assertAmount(p.cents);
  return db.transaction(async (tx) => {
    const prior = await priorPosting(tx, p.idempotencyKey, userId, {
      cents: p.cents, accountIds: [p.fromAccountId], metadata: { beneficiaryId: p.beneficiaryId },
    });
    if (prior) return prior;
    const from = await ownedAccount(tx, userId, p.fromAccountId);
    const [ben] = await tx.select().from(S.beneficiaries)
      .where(and(eq(S.beneficiaries.id, p.beneficiaryId), eq(S.beneficiaries.userId, userId))).limit(1);
    if (!ben) throw notFound("beneficiary");
    await enforceDailyLimit(tx, userId, p.cents);

    const fee = feeFor(ben.type, p.cents);
    const ref = p.reference?.slice(0, 40) || undefined;
    const legs = [{ accountId: from.id, cents: -(p.cents + fee), narrative: `Payment to ${ben.name}${ref ? ` · ${ref}` : ""}` }];
    let type: "TRANSFER" | "EXTERNAL_TRANSFER" | "INTERNATIONAL";
    const metadata: Record<string, unknown> = { beneficiaryId: ben.id, bank: ben.bankName, reference: ref };

    if (ben.type === "CITIZEN") {
      const [dest] = await tx.select().from(S.accounts).where(eq(S.accounts.number, ben.accountNumber)).limit(1);
      if (!dest || dest.type === "INTERNAL") throw new BankError("BAD_BENEFICIARY", `${ben.name}'s Citizen Bank account number isn't valid.`);
      if (dest.id === from.id) throw new BankError("SAME_ACCOUNT", "You can't pay an account into itself.");
      const [payer] = await tx.select().from(S.users).where(eq(S.users.id, userId)).limit(1);
      legs.push({ accountId: dest.id, cents: p.cents, narrative: `Received from ${payer.firstName} ${payer.lastName.charAt(0)}${ref ? ` · ${ref}` : ""}` });
      type = "TRANSFER";
      if (dest.userId) await notify(tx, dest.userId, "Money received", `${payer.firstName} sent you ${formatMoney(fromCents(p.cents))}.`);
    } else if (ben.type === "LOCAL") {
      const clearing = await systemAccount(tx, "CLEARING_LOCAL");
      legs.push({ accountId: clearing.id, cents: p.cents, narrative: `Outward EFT to ${ben.bankName} for ${ben.name}` });
      type = "EXTERNAL_TRANSFER";
    } else {
      const clearing = await systemAccount(tx, "CLEARING_INTL");
      const country = SUPPORTED_COUNTRIES_CROSS_BORDER.find((c) => c.code === ben.country);
      const cur = country?.currency ?? "USD";
      metadata.destinationCurrency = cur;
      metadata.destinationAmount = (p.cents / 100) * fxRate(cur);
      metadata.country = ben.country;
      legs.push({ accountId: clearing.id, cents: p.cents, narrative: `SWIFT to ${ben.name}, ${country?.name ?? ben.country}` });
      type = "INTERNATIONAL";
    }
    if (fee > 0) {
      const feeAcc = await systemAccount(tx, "FEE_INCOME");
      legs.push({ accountId: feeAcc.id, cents: fee, narrative: `Fee on payment to ${ben.name}` });
    }

    const posted = await postTransaction(tx, {
      type,
      description: `Payment to ${ben.name}`,
      amountCents: p.cents,
      feeCents: fee,
      legs,
      metadata,
      idempotencyKey: p.idempotencyKey,
      initiatedById: userId,
    });
    await tx.update(S.beneficiaries).set({ lastPaidAt: new Date() }).where(eq(S.beneficiaries.id, ben.id));
    return posted;
  });
}

export async function payBill(
  userId: string,
  p: { fromAccountId: string; billerId: string; cents: number; customerRef?: string; idempotencyKey?: string; kind?: "BILL_PAYMENT" | "AIRTIME" },
) {
  assertAmount(p.cents);
  return db.transaction(async (tx) => {
    const prior = await priorPosting(tx, p.idempotencyKey, userId, {
      cents: p.cents, accountIds: [p.fromAccountId], metadata: { billerId: p.billerId },
    });
    if (prior) return prior;
    const from = await ownedAccount(tx, userId, p.fromAccountId);
    const [biller] = await tx.select().from(S.billers).where(and(eq(S.billers.id, p.billerId), eq(S.billers.active, true))).limit(1);
    if (!biller) throw notFound("biller");
    await enforceDailyLimit(tx, userId, p.cents);
    const kind = p.kind ?? (biller.isAirtime ? "AIRTIME" : "BILL_PAYMENT");
    const ref = p.customerRef?.slice(0, 40);
    const label = kind === "AIRTIME" ? `${biller.name} airtime${ref ? ` · ${ref}` : ""}` : `${biller.name}${ref ? ` · ${ref}` : ""}`;
    return postTransaction(tx, {
      type: kind,
      description: label,
      amountCents: p.cents,
      legs: [
        { accountId: from.id, cents: -p.cents, narrative: label },
        { accountId: biller.settlementAccountId, cents: p.cents, narrative: `Collection for ${biller.name} from ${from.number}` },
      ],
      metadata: { billerId: biller.id, customerRef: ref },
      idempotencyKey: p.idempotencyKey,
      initiatedById: userId,
    });
  });
}

/* ----------------------------------------------------------- beneficiaries */

export async function addBeneficiary(
  userId: string,
  p: { name: string; bankName: string; accountNumber: string; country?: string; swift?: string; branchCode?: string },
) {
  const name = p.name.trim();
  const accountNumber = p.accountNumber.replace(/\s/g, "");
  if (name.length < 2) throw new BankError("BAD_NAME", "Please enter the beneficiary's full name.");
  if (!/^[A-Za-z0-9]{6,34}$/.test(accountNumber)) throw new BankError("BAD_ACCOUNT", "That doesn't look like a full account number.");
  const isCitizen = /citizen/i.test(p.bankName);
  const international = !!p.country && p.country.toUpperCase() !== "LS";
  const type = international ? "INTERNATIONAL" : isCitizen ? "CITIZEN" : "LOCAL";
  if (type === "CITIZEN") {
    const [dest] = await db.select({ id: S.accounts.id, type: S.accounts.type }).from(S.accounts).where(eq(S.accounts.number, accountNumber)).limit(1);
    if (!dest || dest.type === "INTERNAL") throw new BankError("BAD_ACCOUNT", "I couldn't find that Citizen Bank account number.");
  }
  const [row] = await db
    .insert(S.beneficiaries)
    .values({
      userId, name, type, bankName: p.bankName.trim(), accountNumber,
      country: international ? p.country!.toUpperCase() : null, swift: p.swift ?? null, branchCode: p.branchCode ?? null,
    })
    .onConflictDoUpdate({
      target: [S.beneficiaries.userId, S.beneficiaries.bankName, S.beneficiaries.accountNumber],
      set: { name },
    })
    .returning();
  return row;
}

export async function deleteBeneficiary(userId: string, id: string) {
  const res = await db.delete(S.beneficiaries).where(and(eq(S.beneficiaries.id, id), eq(S.beneficiaries.userId, userId))).returning();
  if (!res.length) throw notFound("beneficiary");
}

/* ------------------------------------------------------------------ cards */

async function ownedCard(userId: string, cardId: string) {
  const [c] = await db.select().from(S.cards).where(and(eq(S.cards.id, cardId), eq(S.cards.userId, userId))).limit(1);
  if (!c) throw notFound("card");
  return c;
}

export async function setCardStatus(userId: string, cardId: string, action: "freeze" | "unfreeze" | "block") {
  const card = await ownedCard(userId, cardId);
  if (card.status === "BLOCKED") throw new BankError("CARD_BLOCKED", "This card is permanently blocked. Please order a replacement.");
  const status = action === "freeze" ? "FROZEN" : action === "block" ? "BLOCKED" : "ACTIVE";
  const [row] = await db.update(S.cards).set({ status }).where(eq(S.cards.id, card.id)).returning();
  return row;
}

export async function setCardLimits(userId: string, cardId: string, p: { dailyCents?: number; monthlyCents?: number }) {
  const card = await ownedCard(userId, cardId);
  const daily = p.dailyCents ?? toCents(card.dailyLimit);
  const monthly = p.monthlyCents ?? Math.max(toCents(card.monthlyLimit), daily);
  for (const v of [daily, monthly]) {
    if (!Number.isInteger(v) || v <= 0) throw new BankError("BAD_LIMIT", "Please enter a limit greater than zero.");
    if (v > MAX_CARD_LIMIT_CENTS) throw new BankError("BAD_LIMIT", `The highest limit I can set here is ${formatMoney(fromCents(MAX_CARD_LIMIT_CENTS))}.`);
  }
  if (daily > monthly) throw new BankError("BAD_LIMIT", "The daily limit can't be higher than the monthly limit.");
  const [row] = await db.update(S.cards).set({ dailyLimit: fromCents(daily), monthlyLimit: fromCents(monthly) }).where(eq(S.cards.id, card.id)).returning();
  return row;
}

export async function orderCard(
  userId: string,
  p: { kind: "DEBIT" | "CRYPTO"; accountId?: string; form: "VIRTUAL" | "PHYSICAL"; deliveryAddress?: string; replacesCardId?: string },
) {
  if (p.form === "PHYSICAL" && (!p.deliveryAddress || p.deliveryAddress.trim().length < 8)) {
    throw new BankError("BAD_ADDRESS", "Please give a full delivery address for the physical card.");
  }
  let label = "Crypto";
  let accountId: string | null = null;
  if (p.kind === "DEBIT") {
    if (!p.accountId) throw new BankError("NO_ACCOUNT", "Which account should the card be linked to?");
    const acc = await ownedAccount(db, userId, p.accountId);
    label = acc.name.replace(/ Account$/i, "");
    accountId = acc.id;
  }
  if (p.replacesCardId) {
    const old = await ownedCard(userId, p.replacesCardId);
    await db.update(S.cards).set({ status: "BLOCKED" }).where(eq(S.cards.id, old.id));
  }
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 4);
  const last4 = String(Math.floor(1000 + Math.random() * 9000));
  const [row] = await db.insert(S.cards).values({
    userId, accountId, label, last4,
    brand: p.kind === "CRYPTO" ? "CRYPTO" : "VISA",
    kind: p.kind, form: p.form,
    expiry: `${String(exp.getMonth() + 1).padStart(2, "0")}/${String(exp.getFullYear()).slice(2)}`,
    status: p.form === "PHYSICAL" ? "ORDERED" : "ACTIVE",
    dailyLimit: "5000.00", monthlyLimit: "50000.00",
    deliveryAddress: p.form === "PHYSICAL" ? p.deliveryAddress!.trim() : null,
  }).returning();
  return row;
}

/* -------------------------------------------------------------- scheduled */

export async function listScheduled(userId: string) {
  return db
    .select({
      id: S.scheduledPayments.id, description: S.scheduledPayments.description, amount: S.scheduledPayments.amount,
      frequency: S.scheduledPayments.frequency, nextRunAt: S.scheduledPayments.nextRunAt, active: S.scheduledPayments.active,
      fromAccountId: S.scheduledPayments.fromAccountId, beneficiaryId: S.scheduledPayments.beneficiaryId,
      billerId: S.scheduledPayments.billerId, lastError: S.scheduledPayments.lastError,
    })
    .from(S.scheduledPayments)
    .where(and(eq(S.scheduledPayments.userId, userId), eq(S.scheduledPayments.active, true)))
    .orderBy(asc(S.scheduledPayments.nextRunAt));
}

export async function createScheduled(
  userId: string,
  p: { fromAccountId: string; beneficiaryId?: string; billerId?: string; cents: number; frequency: "ONCE" | "WEEKLY" | "MONTHLY" | "QUARTERLY"; startDate: Date; reference?: string },
) {
  assertAmount(p.cents);
  await ownedAccount(db, userId, p.fromAccountId);
  if (!!p.beneficiaryId === !!p.billerId) throw new BankError("BAD_SCHEDULE", "Choose either a beneficiary or a biller.");
  let description: string;
  if (p.beneficiaryId) {
    const [b] = await db.select().from(S.beneficiaries).where(and(eq(S.beneficiaries.id, p.beneficiaryId), eq(S.beneficiaries.userId, userId))).limit(1);
    if (!b) throw notFound("beneficiary");
    description = `Payment to ${b.name}`;
  } else {
    const [b] = await db.select().from(S.billers).where(eq(S.billers.id, p.billerId!)).limit(1);
    if (!b) throw notFound("biller");
    description = b.name;
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (p.startDate < today) throw new BankError("BAD_DATE", "The start date can't be in the past.");
  const [row] = await db.insert(S.scheduledPayments).values({
    userId, fromAccountId: p.fromAccountId, beneficiaryId: p.beneficiaryId ?? null, billerId: p.billerId ?? null,
    amount: fromCents(p.cents), frequency: p.frequency, nextRunAt: p.startDate, reference: p.reference ?? null, description,
  }).returning();
  return row;
}

export async function cancelScheduled(userId: string, id: string) {
  const res = await db.update(S.scheduledPayments).set({ active: false })
    .where(and(eq(S.scheduledPayments.id, id), eq(S.scheduledPayments.userId, userId))).returning();
  if (!res.length) throw notFound("scheduled payment");
}

function advance(d: Date, f: string) {
  const n = new Date(d);
  if (f === "WEEKLY") n.setDate(n.getDate() + 7);
  else if (f === "MONTHLY") n.setMonth(n.getMonth() + 1);
  else if (f === "QUARTERLY") n.setMonth(n.getMonth() + 3);
  return n;
}

/** Called by the daily Vercel cron. Each run is idempotent per (schedule, due date). */
export async function runDueScheduledPayments(now = new Date()) {
  const due = await db.select().from(S.scheduledPayments)
    .where(and(eq(S.scheduledPayments.active, true), lte(S.scheduledPayments.nextRunAt, now)));
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const s of due) {
    const key = `sched:${s.id}:${s.nextRunAt.toISOString().slice(0, 10)}`;
    try {
      const cents = toCents(s.amount);
      if (s.beneficiaryId) {
        await payBeneficiary(s.userId, { fromAccountId: s.fromAccountId, beneficiaryId: s.beneficiaryId, cents, reference: s.reference ?? undefined, idempotencyKey: key });
      } else if (s.billerId) {
        await payBill(s.userId, { fromAccountId: s.fromAccountId, billerId: s.billerId, cents, customerRef: s.reference ?? undefined, idempotencyKey: key });
      }
      await db.update(S.scheduledPayments).set({
        lastRunAt: now, lastError: null,
        nextRunAt: advance(s.nextRunAt, s.frequency), active: s.frequency !== "ONCE",
      }).where(eq(S.scheduledPayments.id, s.id));
      results.push({ id: s.id, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.update(S.scheduledPayments).set({ lastRunAt: now, lastError: msg }).where(eq(S.scheduledPayments.id, s.id));
      await db.insert(S.notifications).values({ userId: s.userId, title: "Scheduled payment failed", body: `${s.description}: ${msg}` });
      results.push({ id: s.id, ok: false, error: msg });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ loans */

export const LOAN_RATES: Record<string, number> = {
  PERSONAL: 10.5, BUSINESS: 12.0, MORTGAGE: 8.5, VEHICLE: 9.0, EDUCATION: 7.5,
};

export function loanQuote(type: string, principal: number, termMonths: number) {
  const annual = LOAN_RATES[type.toUpperCase()];
  if (annual === undefined) throw new BankError("BAD_LOAN_TYPE", "Loan type must be personal, business, mortgage, vehicle or education.");
  if (!(principal > 0) || !(termMonths > 0 && termMonths <= 360)) throw new BankError("BAD_LOAN", "Enter a positive amount and a term of up to 360 months.");
  const r = annual / 100 / 12;
  const monthly = (principal * r) / (1 - Math.pow(1 + r, -termMonths));
  const total = monthly * termMonths;
  return {
    type: type.toUpperCase(), annualRate: annual, principal, termMonths,
    monthlyPayment: Math.round(monthly * 100) / 100,
    totalRepayable: Math.round(total * 100) / 100,
    totalInterest: Math.round((total - principal) * 100) / 100,
  };
}

/* -------------------------------------------------------------- insights */

const CATEGORY: Record<string, string> = {
  BILL_PAYMENT: "Bills & utilities", AIRTIME: "Airtime & data", TRANSFER: "Payments to people",
  EXTERNAL_TRANSFER: "Payments to other banks", INTERNATIONAL: "Cross-border", FEE: "Fees", LOAN_REPAYMENT: "Loan repayments",
};

export async function spendingInsights(userId: string) {
  const res = await db.execute(sql`
    SELECT t.type,
      SUM(CASE WHEN le.created_at >= date_trunc('month', now()) THEN -le.amount ELSE 0 END)::text AS this_month,
      SUM(CASE WHEN le.created_at <  date_trunc('month', now())
                AND le.created_at >= date_trunc('month', now()) - interval '1 month' THEN -le.amount ELSE 0 END)::text AS last_month
    FROM ledger_entries le
    JOIN accounts a ON a.id = le.account_id
    JOIN transactions t ON t.id = le.transaction_id
    WHERE a.user_id = ${userId} AND le.amount < 0 AND t.type <> 'INTERNAL_TRANSFER'
      AND le.created_at >= date_trunc('month', now()) - interval '1 month'
    GROUP BY t.type
  `);
  const rows = (res.rows as { type: string; this_month: string; last_month: string }[]).map((r) => ({
    category: CATEGORY[r.type] ?? r.type, thisMonth: Number(r.this_month), lastMonth: Number(r.last_month),
  }));
  const thisMonth = rows.reduce((a, r) => a + r.thisMonth, 0);
  const lastMonth = rows.reduce((a, r) => a + r.lastMonth, 0);
  return { thisMonth, lastMonth, byCategory: rows.sort((a, b) => b.thisMonth - a.thisMonth) };
}

/* --------------------------------------------------------------- branches */

export async function nearestBranches(lat?: number, lng?: number, limit = 3) {
  const all = await db.select().from(S.branches);
  if (lat === undefined || lng === undefined) return all.slice(0, limit).map((b) => ({ ...b, distanceKm: null as number | null }));
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  return all
    .map((b) => {
      const dLat = toRad(b.lat - lat), dLng = toRad(b.lng - lng);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return { ...b, distanceKm: Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10 };
    })
    .sort((a, b) => a.distanceKm! - b.distanceKm!)
    .slice(0, limit);
}

/* ----------------------------------------------------------- notifications */

export async function listNotifications(userId: string) {
  return db.select().from(S.notifications).where(eq(S.notifications.userId, userId)).orderBy(desc(S.notifications.createdAt)).limit(50);
}
export async function markNotificationsRead(userId: string, ids?: string[]) {
  const cond = ids?.length
    ? and(eq(S.notifications.userId, userId), inArray(S.notifications.id, ids))
    : eq(S.notifications.userId, userId);
  await db.update(S.notifications).set({ read: true }).where(cond);
}

/* ------------------------------------------------------------------ profile */

export async function updateProfile(userId: string, p: { preferredLanguage?: string; preferredTheme?: string; phone?: string }) {
  const set: Record<string, string> = {};
  if (p.preferredLanguage && ["en", "st", "zu"].includes(p.preferredLanguage)) set.preferredLanguage = p.preferredLanguage;
  if (p.preferredTheme && ["dark", "light"].includes(p.preferredTheme)) set.preferredTheme = p.preferredTheme;
  if (p.phone !== undefined) set.phone = p.phone.slice(0, 30);
  if (!Object.keys(set).length) return;
  await db.update(S.users).set(set).where(eq(S.users.id, userId));
}
