CREATE TABLE "comp_ranks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"group_name" text,
	"tier_label" text,
	"code" text NOT NULL,
	"promo_pct" double precision,
	"exec_pct" double precision
);
--> statement-breakpoint
CREATE TABLE "comp_thresholds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"from_code" text,
	"to_code" text NOT NULL,
	"cases" integer,
	"fees" bigint,
	"team_cases" integer,
	"mentor_count" integer,
	"mentor_rank_code" text,
	"extra_note" text,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comp_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"effective_from" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"change_note" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comp_ranks" ADD CONSTRAINT "comp_ranks_version_id_comp_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."comp_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_thresholds" ADD CONSTRAINT "comp_thresholds_version_id_comp_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."comp_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comp_ranks_version_id_idx" ON "comp_ranks" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comp_ranks_version_code_uidx" ON "comp_ranks" USING btree ("version_id","code");--> statement-breakpoint
CREATE INDEX "comp_thresholds_version_id_idx" ON "comp_thresholds" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comp_thresholds_version_kind_to_uidx" ON "comp_thresholds" USING btree ("version_id","kind","to_code");--> statement-breakpoint
CREATE INDEX "comp_versions_status_idx" ON "comp_versions" USING btree ("status");