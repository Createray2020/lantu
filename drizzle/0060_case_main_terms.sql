-- 案件進度（2026/10/28）：service_cases 改成「一客戶一案件」主軸，原本的 service_cases（一年度一案）改名 service_terms（服務年期）掛在案件底下。
ALTER TABLE "service_cases" RENAME TO "service_terms";
--> statement-breakpoint
ALTER TABLE "service_terms" RENAME CONSTRAINT "service_cases_pkey" TO "service_terms_pkey";
--> statement-breakpoint
ALTER INDEX "service_cases_client_idx" RENAME TO "service_terms_client_idx";
--> statement-breakpoint
ALTER INDEX "service_cases_coach_idx" RENAME TO "service_terms_coach_idx";
--> statement-breakpoint
ALTER INDEX "service_cases_case_no_uq" RENAME TO "service_terms_case_no_uq";
--> statement-breakpoint
ALTER INDEX "service_cases_client_year_live_uq" RENAME TO "service_terms_client_year_live_uq";
--> statement-breakpoint
ALTER TABLE "service_terms" RENAME CONSTRAINT "service_cases_client_id_clients_id_fk" TO "service_terms_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "service_terms" RENAME CONSTRAINT "service_cases_coach_id_coaches_id_fk" TO "service_terms_coach_id_coaches_id_fk";
--> statement-breakpoint
ALTER TABLE "service_terms" RENAME CONSTRAINT "service_cases_promo_coach_id_coaches_id_fk" TO "service_terms_promo_coach_id_coaches_id_fk";
--> statement-breakpoint
ALTER TABLE "service_terms" RENAME CONSTRAINT "service_cases_signer_client_user_id_client_users_id_fk" TO "service_terms_signer_client_user_id_client_users_id_fk";
--> statement-breakpoint
CREATE TABLE "service_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"coach_id" text NOT NULL,
	"s3_coach_id" text,
	"case_no" text NOT NULL,
	"stage" text DEFAULT 'commission' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" date,
	"paused_at" date,
	"pause_reason" text DEFAULT '' NOT NULL,
	"waiting_since" date,
	"waiting_note" text DEFAULT '' NOT NULL,
	"waiting_days" integer DEFAULT 0 NOT NULL,
	"closed_at" date,
	"close_reason" text DEFAULT '' NOT NULL,
	"close_note" text DEFAULT '' NOT NULL,
	"escalation" integer DEFAULT 0 NOT NULL,
	"escalated_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_case_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"started_on" date,
	"expected_date" date,
	"promised_date" date,
	"actual_date" date,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"decision" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_case_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"stage" text,
	"actor_type" text DEFAULT 'system' NOT NULL,
	"actor_id" text,
	"actor_name" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_stage_params" (
	"stage" text PRIMARY KEY NOT NULL,
	"days" integer NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_s3_coach_id_coaches_id_fk" FOREIGN KEY ("s3_coach_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_case_stages" ADD CONSTRAINT "service_case_stages_case_id_service_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."service_cases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_case_log" ADD CONSTRAINT "service_case_log_case_id_service_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."service_cases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "service_cases_client_uq" ON "service_cases" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX "service_cases_coach_idx" ON "service_cases" USING btree ("coach_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "service_cases_case_no_uq" ON "service_cases" USING btree ("case_no");
--> statement-breakpoint
CREATE INDEX "service_cases_stage_idx" ON "service_cases" USING btree ("stage","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "service_case_stages_case_stage_uq" ON "service_case_stages" USING btree ("case_id","stage");
--> statement-breakpoint
CREATE INDEX "service_case_log_case_idx" ON "service_case_log" USING btree ("case_id","created_at");
--> statement-breakpoint
ALTER TABLE "service_terms" ADD COLUMN "case_id" uuid;
--> statement-breakpoint
ALTER TABLE "service_terms" ADD CONSTRAINT "service_terms_case_id_service_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."service_cases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "service_terms_case_idx" ON "service_terms" USING btree ("case_id");
--> statement-breakpoint
-- 回填：每位已有年期的客戶長一筆案件（教練＝最新一期的主責教練；案號＝客戶編號，沒編號用 id 前 8 碼），年期掛上去，並長第一階段列。
INSERT INTO "service_cases" ("client_id","coach_id","case_no","started_at","created_at")
SELECT t.client_id, t.coach_id, coalesce(c.code, left(c.id::text, 8)), min_created::date, min_created
FROM (
  SELECT DISTINCT ON (client_id) client_id, coach_id, (SELECT min(created_at) FROM "service_terms" x WHERE x.client_id = s.client_id) AS min_created
  FROM "service_terms" s ORDER BY client_id, created_at DESC
) t JOIN "clients" c ON c.id = t.client_id;
--> statement-breakpoint
UPDATE "service_terms" s SET "case_id" = k.id FROM "service_cases" k WHERE k.client_id = s.client_id AND s.case_id IS NULL;
--> statement-breakpoint
INSERT INTO "service_case_stages" ("case_id","stage","started_on","expected_date")
SELECT id, 'commission', started_at, started_at + 7 FROM "service_cases";
