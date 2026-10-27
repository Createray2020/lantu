CREATE TABLE "doc_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_type" text NOT NULL,
	"case_id" text NOT NULL,
	"template_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"html_snapshot" text NOT NULL,
	"hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" date,
	"final_hash" text,
	"completed_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"template_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_signers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"role" text NOT NULL,
	"seq" integer DEFAULT 1 NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"coach_id" text,
	"client_user_id" text,
	"display_name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"consent_at" timestamp with time zone,
	"signature_img" text,
	"signed_at" timestamp with time zone,
	"ip" text,
	"ua" text,
	"hash_at_sign" text,
	"decline_reason" text
);
--> statement-breakpoint
CREATE TABLE "doc_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"category" text DEFAULT 'training' NOT NULL,
	"name" text NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"use_seal" boolean DEFAULT true NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"sign_days" integer,
	"signers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"owner_kind" text NOT NULL,
	"owner_id" text NOT NULL,
	"img" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signatures_owner_kind_owner_id_pk" PRIMARY KEY("owner_kind","owner_id")
);
--> statement-breakpoint
CREATE TABLE "training_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" text NOT NULL,
	"item_id" text NOT NULL,
	"item_name" text DEFAULT '' NOT NULL,
	"amount_due" double precision DEFAULT 0 NOT NULL,
	"review_stage" text DEFAULT 'pending' NOT NULL,
	"passed_at" timestamp with time zone,
	"passed_by" text,
	"activated_at" timestamp with time zone,
	"expires_at" date,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acct_receipts" ADD COLUMN "case_type" text DEFAULT 'client_service' NOT NULL;--> statement-breakpoint
ALTER TABLE "acct_receipts" ADD COLUMN "case_id" text;--> statement-breakpoint
ALTER TABLE "acct_receipts" ADD COLUMN "gross" double precision;--> statement-breakpoint
ALTER TABLE "acct_receipts" ADD COLUMN "fee" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "acct_receipts" ADD COLUMN "method" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "acct_receipts" ADD COLUMN "method_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_apply_settings" ADD COLUMN "training_item_id" text;--> statement-breakpoint
ALTER TABLE "doc_instances" ADD CONSTRAINT "doc_instances_template_id_doc_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."doc_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_signers" ADD CONSTRAINT "doc_signers_instance_id_doc_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."doc_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_signers" ADD CONSTRAINT "doc_signers_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_signers" ADD CONSTRAINT "doc_signers_client_user_id_client_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_templates" ADD CONSTRAINT "doc_templates_created_by_coaches_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_instances_case_idx" ON "doc_instances" USING btree ("case_type","case_id");--> statement-breakpoint
CREATE INDEX "doc_instances_status_idx" ON "doc_instances" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_instances_case_key_live_uq" ON "doc_instances" USING btree ("case_type","case_id","template_key") WHERE status <> 'void';--> statement-breakpoint
CREATE UNIQUE INDEX "doc_sets_kind_ref_uq" ON "doc_sets" USING btree ("kind","ref");--> statement-breakpoint
CREATE INDEX "doc_signers_instance_idx" ON "doc_signers" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "doc_signers_coach_idx" ON "doc_signers" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "doc_signers_client_user_idx" ON "doc_signers" USING btree ("client_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_templates_key_version_uq" ON "doc_templates" USING btree ("key","version");--> statement-breakpoint
CREATE INDEX "doc_templates_category_idx" ON "doc_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "training_enrollments_coach_idx" ON "training_enrollments" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "training_enrollments_stage_idx" ON "training_enrollments" USING btree ("review_stage");--> statement-breakpoint
CREATE INDEX "acct_receipts_case_idx" ON "acct_receipts" USING btree ("case_type","case_id");