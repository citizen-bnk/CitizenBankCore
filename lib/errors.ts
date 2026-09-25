/** A domain error whose message is safe to show (or speak) to the customer. */
export class BankError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = "BankError";
  }
}

export const notFound = (what: string) => new BankError("NOT_FOUND", `I couldn't find that ${what}.`, 404);
