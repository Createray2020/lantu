CREATE TABLE "coach_applications" (
	"coach_id" text PRIMARY KEY NOT NULL,
	"route" text DEFAULT 'referral' NOT NULL,
	"introducer_id" text,
	"introducer_code" text,
	"phone" text,
	"current_job" text,
	"motive" text,
	"experience" text,
	"licenses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"consents" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"introducer_state" text DEFAULT 'pending' NOT NULL,
	"introducer_note" text,
	"introducer_acted_at" timestamp with time zone,
	"review_checks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"review_note" text,
	"reviewer_id" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_apply_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"default_rank_code" text DEFAULT 'C1',
	"bind_upline_to_introducer" boolean DEFAULT true NOT NULL,
	"require_introducer_confirm" boolean DEFAULT true NOT NULL,
	"license_on" boolean DEFAULT true NOT NULL,
	"license_unit" text DEFAULT 'year' NOT NULL,
	"license_qty" integer DEFAULT 1 NOT NULL,
	"required_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_applications" ADD CONSTRAINT "coach_applications_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_applications" ADD CONSTRAINT "coach_applications_introducer_id_coaches_id_fk" FOREIGN KEY ("introducer_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_applications" ADD CONSTRAINT "coach_applications_reviewer_id_coaches_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_applications_introducer_id_idx" ON "coach_applications" USING btree ("introducer_id");--> statement-breakpoint
CREATE INDEX "coach_applications_state_idx" ON "coach_applications" USING btree ("introducer_state");