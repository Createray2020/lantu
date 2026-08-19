CREATE TABLE "comp_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"payout_date" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_amount" bigint DEFAULT 0 NOT NULL,
	"approved_by" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comp_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"client_id" uuid,
	"client_name" text NOT NULL,
	"service_type" text DEFAULT 'full' NOT NULL,
	"fee" bigint DEFAULT 0 NOT NULL,
	"is_company_lead" boolean DEFAULT false NOT NULL,
	"promoter_id" text,
	"executor_id" text NOT NULL,
	"signed_at" date,
	"paid_at" date,
	"survey_at" date,
	"case_year" integer NOT NULL,
	"refund_amount" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comp_maintenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" text NOT NULL,
	"year" integer NOT NULL,
	"exec_cases" integer DEFAULT 0 NOT NULL,
	"train_hours" double precision DEFAULT 0 NOT NULL,
	"exec_pass" boolean DEFAULT false NOT NULL,
	"train_pass" boolean DEFAULT false NOT NULL,
	"exempt" boolean DEFAULT false NOT NULL,
	"exempt_reason" text,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comp_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"payee_id" text,
	"payee_key" text NOT NULL,
	"payee_name" text NOT NULL,
	"kind" text NOT NULL,
	"role" text,
	"rank_code" text,
	"promo_pct" double precision DEFAULT 0 NOT NULL,
	"exec_pct" double precision DEFAULT 0 NOT NULL,
	"bonus_pct" double precision DEFAULT 0 NOT NULL,
	"total_pct" double precision DEFAULT 0 NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"batch_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"trace" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comp_rank_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" text NOT NULL,
	"from_code" text,
	"to_code" text,
	"reason" text NOT NULL,
	"effective_at" date,
	"operator_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comp_training_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" text NOT NULL,
	"session_id" uuid,
	"year" integer NOT NULL,
	"kind" text NOT NULL,
	"hours" double precision DEFAULT 0 NOT NULL,
	"title" text,
	"evidence" text,
	"status" text DEFAULT 'approved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comp_training_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"held_on" date NOT NULL,
	"topic" text NOT NULL,
	"mode" text DEFAULT 'onsite' NOT NULL,
	"hours" double precision,
	"speaker_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "rank_code" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "entry_type" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "hire_date" date;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "sponsor_id" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "tenure_rank_code" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "tenure_until" date;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "initial_cases" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "initial_fees" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "recruit_allowed" boolean;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "lead_allowed" boolean;--> statement-breakpoint
ALTER TABLE "comp_batches" ADD CONSTRAINT "comp_batches_approved_by_coaches_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_cases" ADD CONSTRAINT "comp_cases_version_id_comp_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."comp_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_cases" ADD CONSTRAINT "comp_cases_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_cases" ADD CONSTRAINT "comp_cases_promoter_id_coaches_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_cases" ADD CONSTRAINT "comp_cases_executor_id_coaches_id_fk" FOREIGN KEY ("executor_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_maintenance" ADD CONSTRAINT "comp_maintenance_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_payouts" ADD CONSTRAINT "comp_payouts_case_id_comp_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."comp_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_payouts" ADD CONSTRAINT "comp_payouts_payee_id_coaches_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_payouts" ADD CONSTRAINT "comp_payouts_batch_id_comp_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."comp_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_rank_events" ADD CONSTRAINT "comp_rank_events_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_rank_events" ADD CONSTRAINT "comp_rank_events_operator_id_coaches_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_training_records" ADD CONSTRAINT "comp_training_records_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_training_records" ADD CONSTRAINT "comp_training_records_session_id_comp_training_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."comp_training_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_training_sessions" ADD CONSTRAINT "comp_training_sessions_speaker_id_coaches_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comp_batches_period_uidx" ON "comp_batches" USING btree ("period");--> statement-breakpoint
CREATE INDEX "comp_cases_executor_year_idx" ON "comp_cases" USING btree ("executor_id","case_year");--> statement-breakpoint
CREATE INDEX "comp_cases_promoter_id_idx" ON "comp_cases" USING btree ("promoter_id");--> statement-breakpoint
CREATE INDEX "comp_cases_version_id_idx" ON "comp_cases" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "comp_cases_client_id_idx" ON "comp_cases" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "comp_cases_status_idx" ON "comp_cases" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "comp_maintenance_coach_year_uidx" ON "comp_maintenance" USING btree ("coach_id","year");--> statement-breakpoint
CREATE INDEX "comp_payouts_case_id_idx" ON "comp_payouts" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "comp_payouts_payee_id_idx" ON "comp_payouts" USING btree ("payee_id");--> statement-breakpoint
CREATE INDEX "comp_payouts_batch_id_idx" ON "comp_payouts" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comp_payouts_case_payee_active_uidx" ON "comp_payouts" USING btree ("case_id","payee_key") WHERE status <> 'void';--> statement-breakpoint
CREATE INDEX "comp_rank_events_coach_id_idx" ON "comp_rank_events" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "comp_training_records_coach_year_idx" ON "comp_training_records" USING btree ("coach_id","year");--> statement-breakpoint
CREATE INDEX "comp_training_records_session_id_idx" ON "comp_training_records" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comp_training_records_session_coach_uidx" ON "comp_training_records" USING btree ("session_id","coach_id","kind");--> statement-breakpoint
CREATE INDEX "comp_training_sessions_held_on_idx" ON "comp_training_sessions" USING btree ("held_on");--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_sponsor_id_coaches_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coaches_sponsor_id_idx" ON "coaches" USING btree ("sponsor_id");