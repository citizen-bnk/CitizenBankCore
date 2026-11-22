ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'CRYPTO';
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN allow_mixed_card_forms boolean NOT NULL DEFAULT false;
