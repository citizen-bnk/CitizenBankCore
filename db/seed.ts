/**
 * Idempotent seed. Safe to run on every deploy (it is part of "vercel-build"):
 *  - always upserts bank system accounts, billers and branches;
 *  - creates demo customers + ~60 days of history only when no customers exist
 *    and SEED_DEMO_DATA is not "false".
 */
import { loadEnv } from "./env";
loadEnv();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn("[seed] No DATABASE_URL set — skipping seed.");
    return;
  }
  // Import after env is loaded (db/index reads DATABASE_URL at import time).
  const { db, schema } = await import("./index");
  const { eq, sql } = await import("drizzle-orm");
  const { openCustomer, newAccountNumber } = await import("../lib/onboarding");
  const { postTransaction, systemAccount } = await import("../lib/ledger");

  /* ---------------------------------------------------- system accounts */
  const SYSTEM = [
    ["CLEARING_LOCAL", "Outward EFT clearing (Lesotho)"],
    ["CLEARING_INTL", "SWIFT outward clearing"],
    ["CLEARING_INWARD", "Inward payments clearing"],
    ["FEE_INCOME", "Fee income"],
    ["DEMO_FUNDING", "Demo funding suspense"],
  ] as const;
  for (const [code, name] of SYSTEM) {
    const [exists] = await db.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.systemCode, code)).limit(1);
    if (!exists) {
      await db.insert(schema.accounts).values({ name, type: "INTERNAL", systemCode: code, number: await newAccountNumber(db, "INTERNAL") });
    }
  }

  /* ------------------------------------------------------------ billers */
  const BILLERS = [
    { code: "LEC", name: "LEC Prepaid Electricity", category: "ELECTRICITY", refLabel: "Meter number" },
    { code: "WASCO", name: "WASCO Water", category: "WATER", refLabel: "Account number" },
    { code: "ECONET", name: "Econet Telecom Lesotho", category: "TELECOM", refLabel: "Phone number", isAirtime: true },
    { code: "VODACOM", name: "Vodacom Lesotho", category: "TELECOM", refLabel: "Phone number", isAirtime: true },
    { code: "DSTV", name: "DStv Lesotho", category: "TV", refLabel: "Smartcard number" },
    { code: "LRA", name: "Lesotho Revenue Authority", category: "GOVERNMENT", refLabel: "TIN" },
    { code: "MCC", name: "Maseru City Council", category: "GOVERNMENT", refLabel: "Property reference" },
    { code: "NUL", name: "National University of Lesotho", category: "EDUCATION", refLabel: "Student number" },
    { code: "INSURE", name: "Lesotho National Insurance", category: "INSURANCE", refLabel: "Policy number" },
  ];
  for (const b of BILLERS) {
    const [exists] = await db.select({ id: schema.billers.id }).from(schema.billers).where(eq(schema.billers.code, b.code)).limit(1);
    if (exists) continue;
    const [settle] = await db.insert(schema.accounts).values({
      name: `${b.name} collections`, type: "INTERNAL", systemCode: `BILLER_${b.code}`, number: await newAccountNumber(db, "INTERNAL"),
    }).returning();
    await db.insert(schema.billers).values({ ...b, settlementAccountId: settle.id });
  }

  /* ----------------------------------------------------------- branches */
  const [{ n: branchCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.branches);
  if (branchCount === 0) {
    await db.insert(schema.branches).values([
      { name: "Maseru Head Office (planned)", address: "Naleli Road", city: "Maseru", lat: -29.3151, lng: 27.4869, hours: "Mon–Fri 08:30–16:30, Sat 08:30–12:00" },
      { name: "Pioneer Mall service point (planned)", address: "Pioneer Road", city: "Maseru", lat: -29.3197, lng: 27.4822, hours: "Mon–Sat 09:00–17:00" },
      { name: "Maputsoe service point (planned)", address: "Main North 1 Road", city: "Maputsoe", lat: -28.8836, lng: 27.8989, hours: "Mon–Fri 08:30–16:30" },
      { name: "Hlotse service point (planned)", address: "Main Road", city: "Leribe", lat: -28.8711, lng: 28.045, hours: "Mon–Fri 08:30–16:30" },
      { name: "Mafeteng service point (planned)", address: "Main South 1 Road", city: "Mafeteng", lat: -29.823, lng: 27.2374, hours: "Mon–Fri 08:30–16:30" },
      { name: "Mohale's Hoek service point (planned)", address: "Main South 1 Road", city: "Mohale's Hoek", lat: -30.1514, lng: 27.4769, hours: "Mon–Fri 08:30–16:30" },
    ]);
  }

  /* ------------------------------------------------------ demo customers */
  const [{ n: userCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
  if (userCount > 0 || process.env.SEED_DEMO_DATA === "false") {
    console.log("[seed] Reference data up to date (demo customers skipped).");
    await (await import("./index")).db.$client.end();
    return;
  }

  const password = process.env.DEMO_PASSWORD || "Citizen2026!";
  const palesa = await openCustomer({ firstName: "Palesa", lastName: "Mokhethi", email: "palesa@demo.citizenbank.co.ls", phone: "+266 5800 1234", password });
  const thabo = await openCustomer({ firstName: "Thabo", lastName: "Molapo", email: "thabo@demo.citizenbank.co.ls", phone: "+266 6200 5678", password });

  const accs = async (userId: string) => db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId));
  const [pCur, pSav] = (await accs(palesa.id)).sort((a, b) => a.number.localeCompare(b.number));
  const [tCur] = (await accs(thabo.id)).sort((a, b) => a.number.localeCompare(b.number));

  // Fixed deposit for Palesa
  const matures = new Date(); matures.setMonth(matures.getMonth() + 9);
  const [pFd] = await db.insert(schema.accounts).values({
    userId: palesa.id, name: "Fixed Deposit", type: "FIXED_DEPOSIT", number: await newAccountNumber(db, "FIXED_DEPOSIT"), interestRate: "7.25", maturesAt: matures,
  }).returning();

  const funding = await systemAccount(db, "DEMO_FUNDING");
  const inward = await systemAccount(db, "CLEARING_INWARD");
  const biller = async (code: string) => (await db.select().from(schema.billers).where(eq(schema.billers.code, code)))[0];
  const daysAgo = (d: number, h = 10, m = 0) => { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(h, m, 0, 0); return x; };

  await db.transaction(async (tx) => {
    const post = (p: Parameters<typeof postTransaction>[1]) => postTransaction(tx, p);
    // Opening balances
    await post({ type: "DEPOSIT", description: "Opening deposit", amountCents: 1_500_000, at: daysAgo(62, 9),
      legs: [{ accountId: funding.id, cents: -1_500_000, narrative: "Demo funding" }, { accountId: pCur.id, cents: 1_500_000, narrative: "Opening deposit" }] });
    await post({ type: "DEPOSIT", description: "Opening deposit", amountCents: 1_200_000, at: daysAgo(62, 9, 5),
      legs: [{ accountId: funding.id, cents: -1_200_000, narrative: "Demo funding" }, { accountId: pSav.id, cents: 1_200_000, narrative: "Opening deposit" }] });
    await post({ type: "DEPOSIT", description: "Fixed deposit placement", amountCents: 2_000_000, at: daysAgo(62, 9, 10),
      legs: [{ accountId: funding.id, cents: -2_000_000, narrative: "Demo funding" }, { accountId: pFd.id, cents: 2_000_000, narrative: "12-month fixed deposit at 7.25%" }] });
    await post({ type: "DEPOSIT", description: "Opening deposit", amountCents: 800_000, at: daysAgo(62, 9, 15),
      legs: [{ accountId: funding.id, cents: -800_000, narrative: "Demo funding" }, { accountId: tCur.id, cents: 800_000, narrative: "Opening deposit" }] });

    for (const d of [55, 25]) {
      await post({ type: "DEPOSIT", description: "Salary — Ministry of Health", amountCents: 1_850_000, at: daysAgo(d, 7, 30),
        legs: [{ accountId: inward.id, cents: -1_850_000, narrative: "Inward EFT" }, { accountId: pCur.id, cents: 1_850_000, narrative: "Salary — Ministry of Health" }] });
    }
    const bills: [string, number, number, string][] = [
      ["LEC", 50, 60_000, "Meter 0417 2291 83"], ["WASCO", 48, 34_500, "WS-118822"], ["DSTV", 45, 45_000, "Smartcard 7021"],
      ["VODACOM", 40, 10_000, "+266 5800 1234"], ["LEC", 20, 80_000, "Meter 0417 2291 83"], ["WASCO", 18, 31_200, "WS-118822"],
      ["ECONET", 12, 5_000, "+266 6300 4455"], ["DSTV", 14, 45_000, "Smartcard 7021"], ["VODACOM", 3, 20_000, "+266 5800 1234"],
      ["LEC", 1, 120_000, "Meter 0417 2291 83"],
    ];
    for (const [code, d, cents, ref] of bills) {
      const b = await biller(code);
      const label = b.isAirtime ? `${b.name} airtime · ${ref}` : `${b.name} · ${ref}`;
      await post({ type: b.isAirtime ? "AIRTIME" : "BILL_PAYMENT", description: label, amountCents: cents, at: daysAgo(d, 16),
        legs: [{ accountId: pCur.id, cents: -cents, narrative: label }, { accountId: b.settlementAccountId, cents, narrative: `Collection for ${b.name}` }],
        initiatedById: palesa.id });
    }
    await post({ type: "INTERNAL_TRANSFER", description: "Transfer Current → Savings", amountCents: 300_000, at: daysAgo(24, 12),
      legs: [{ accountId: pCur.id, cents: -300_000, narrative: "Transfer to Savings Account" }, { accountId: pSav.id, cents: 300_000, narrative: "Transfer from Current Account" }],
      initiatedById: palesa.id });
    await post({ type: "TRANSFER", description: "Payment to Palesa Mokhethi", amountCents: 120_000, at: daysAgo(0, 9, 24),
      legs: [{ accountId: tCur.id, cents: -120_000, narrative: "Payment to Palesa Mokhethi · Stokvel" }, { accountId: pCur.id, cents: 120_000, narrative: "Received from Thabo M · Stokvel" }],
      initiatedById: thabo.id });
  });

  // Beneficiaries
  const bThabo = (await db.insert(schema.beneficiaries).values({ userId: palesa.id, name: "Thabo Molapo", type: "CITIZEN", bankName: "Citizen Bank", accountNumber: tCur.number, lastPaidAt: daysAgo(6) }).returning())[0];
  await db.insert(schema.beneficiaries).values([
    { userId: palesa.id, name: "Mpho Letsie", type: "LOCAL", bankName: "Standard Lesotho Bank", accountNumber: "9080123456", lastPaidAt: daysAgo(10) },
    { userId: palesa.id, name: "Ts'epo Hardware", type: "LOCAL", bankName: "First National Bank Lesotho", accountNumber: "6200011223" },
    { userId: palesa.id, name: "Lineo Mokoena", type: "INTERNATIONAL", bankName: "Capitec Bank", accountNumber: "1452339876", country: "ZA", swift: "CABLZAJJ" },
  ]);
  await db.insert(schema.beneficiaries).values({ userId: thabo.id, name: "Palesa Mokhethi", type: "CITIZEN", bankName: "Citizen Bank", accountNumber: pCur.number });

  // Extra cards for Palesa (the onboarding flow already issued a Current debit card)
  await db.insert(schema.cards).values([
    { userId: palesa.id, accountId: pSav.id, label: "Savings", last4: pSav.number.slice(-4), brand: "MASTERCARD", kind: "DEBIT", form: "PHYSICAL", expiry: "11/28", dailyLimit: "3000.00", monthlyLimit: "20000.00" },
    { userId: palesa.id, accountId: null, label: "Crypto", last4: "9042", brand: "CRYPTO", kind: "CRYPTO", form: "VIRTUAL", expiry: "—", dailyLimit: "5000.00", monthlyLimit: "20000.00" },
  ]);
  await db.update(schema.cards).set({ form: "PHYSICAL", dailyLimit: "10000.00" }).where(eq(schema.cards.accountId, pCur.id));

  // Scheduled payments
  const nextFirst = new Date(); nextFirst.setMonth(nextFirst.getMonth() + 1, 1); nextFirst.setHours(6, 0, 0, 0);
  const dstv = await biller("DSTV");
  await db.insert(schema.scheduledPayments).values([
    { userId: palesa.id, fromAccountId: pCur.id, beneficiaryId: bThabo.id, description: "Payment to Thabo Molapo", amount: "450.00", frequency: "MONTHLY", nextRunAt: nextFirst, reference: "Stokvel" },
    { userId: palesa.id, fromAccountId: pCur.id, billerId: dstv.id, description: dstv.name, amount: "450.00", frequency: "MONTHLY", nextRunAt: nextFirst, reference: "Smartcard 7021" },
  ]);

  // Loans
  const nextPay = new Date(); nextPay.setDate(25); if (nextPay < new Date()) nextPay.setMonth(nextPay.getMonth() + 1);
  await db.insert(schema.loans).values([
    { userId: palesa.id, type: "VEHICLE", principal: "180000.00", interestRate: "9.00", termMonths: 60, outstanding: "142310.55", monthlyPayment: "3736.52", nextPaymentDate: nextPay },
    { userId: palesa.id, type: "EDUCATION", principal: "30000.00", interestRate: "7.50", termMonths: 36, outstanding: "12480.10", monthlyPayment: "933.18", nextPaymentDate: nextPay },
  ]);

  console.log(`[seed] Demo customers created: palesa@demo.citizenbank.co.ls / thabo@demo.citizenbank.co.ls (password from DEMO_PASSWORD).`);
  await db.$client.end();
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
