CREATE TABLE "acct_cash" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"on" date NOT NULL,
	"kind" text DEFAULT 'out' NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"cat" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "acct_cash_on_idx" ON "acct_cash" USING btree ("on");