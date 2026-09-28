CREATE TABLE "acct_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ym" text NOT NULL,
	"item_id" text NOT NULL,
	"coach_id" text NOT NULL,
	"source" text NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"void" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "acct_entries" ADD CONSTRAINT "acct_entries_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acct_entries_coach_source_uq" ON "acct_entries" USING btree ("coach_id","source");--> statement-breakpoint
CREATE INDEX "acct_entries_ym_idx" ON "acct_entries" USING btree ("ym");