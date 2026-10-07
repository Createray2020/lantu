CREATE TABLE "acct_payouts" (
	"ym" text NOT NULL,
	"payee" text NOT NULL,
	"paid_on" date,
	"amount" double precision DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acct_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ym" text NOT NULL,
	"item_id" text NOT NULL,
	"received_on" date NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"last5" text DEFAULT '' NOT NULL,
	"payer" text DEFAULT '' NOT NULL,
	"payer_coach_id" text,
	"sharers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payees" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"void" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acct_receipts" ADD CONSTRAINT "acct_receipts_payer_coach_id_coaches_id_fk" FOREIGN KEY ("payer_coach_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acct_payouts_ym_payee_uq" ON "acct_payouts" USING btree ("ym","payee");--> statement-breakpoint
CREATE INDEX "acct_receipts_ym_idx" ON "acct_receipts" USING btree ("ym");