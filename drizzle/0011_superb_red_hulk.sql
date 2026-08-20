CREATE TABLE "comp_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"split_mode" text DEFAULT 'chain' NOT NULL,
	"split_promo_pct" double precision,
	"split_exec_pct" double precision,
	"flat_exec_pct" double precision,
	"flat_promo_pct" double precision,
	"price" bigint,
	"count_promotion" boolean DEFAULT true NOT NULL,
	"count_maintenance" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"note" text
);
--> statement-breakpoint
DROP INDEX "comp_ranks_version_code_uidx";--> statement-breakpoint
ALTER TABLE "comp_cases" ADD COLUMN "module_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "comp_ranks" ADD COLUMN "module_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "comp_modules" ADD CONSTRAINT "comp_modules_version_id_comp_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."comp_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comp_modules_version_id_idx" ON "comp_modules" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comp_modules_version_code_uidx" ON "comp_modules" USING btree ("version_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "comp_ranks_version_module_code_uidx" ON "comp_ranks" USING btree ("version_id","module_code","code");