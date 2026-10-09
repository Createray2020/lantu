ALTER TABLE "acct_receipts" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "acct_receipts" ADD COLUMN "exec_coach_id" text;--> statement-breakpoint
ALTER TABLE "acct_receipts" ADD COLUMN "promo_coach_id" text;--> statement-breakpoint
ALTER TABLE "acct_receipts" ADD COLUMN "verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "acct_receipts" ADD COLUMN "entered_by" text;--> statement-breakpoint
ALTER TABLE "acct_receipts" ADD COLUMN "allocs" jsonb;--> statement-breakpoint
ALTER TABLE "acct_receipts" ADD CONSTRAINT "acct_receipts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acct_receipts" ADD CONSTRAINT "acct_receipts_exec_coach_id_coaches_id_fk" FOREIGN KEY ("exec_coach_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acct_receipts" ADD CONSTRAINT "acct_receipts_promo_coach_id_coaches_id_fk" FOREIGN KEY ("promo_coach_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acct_receipts_client_idx" ON "acct_receipts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "acct_receipts_exec_idx" ON "acct_receipts" USING btree ("exec_coach_id");