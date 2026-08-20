CREATE TABLE "comp_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"submitted_by" text DEFAULT 'client' NOT NULL,
	"submitter_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comp_surveys" ADD CONSTRAINT "comp_surveys_case_id_comp_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."comp_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comp_surveys_case_id_uidx" ON "comp_surveys" USING btree ("case_id");