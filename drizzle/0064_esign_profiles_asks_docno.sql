CREATE TABLE "signer_profiles" (
	"owner_kind" text NOT NULL,
	"owner_id" text NOT NULL,
	"id_no" text DEFAULT '' NOT NULL,
	"birth_date" date,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"invoice_kind" text DEFAULT 'personal' NOT NULL,
	"invoice_carrier" text DEFAULT '' NOT NULL,
	"invoice_tax_id" text DEFAULT '' NOT NULL,
	"invoice_title" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signer_profiles_owner_kind_owner_id_pk" PRIMARY KEY("owner_kind","owner_id")
);
--> statement-breakpoint
ALTER TABLE "doc_instances" ADD COLUMN "doc_no" text;--> statement-breakpoint
ALTER TABLE "doc_signers" ADD COLUMN "answers" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "doc_templates" ADD COLUMN "asks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "doc_templates" ADD COLUMN "item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "training_enrollments" ADD COLUMN "member_kind" text DEFAULT 'intern' NOT NULL;--> statement-breakpoint
ALTER TABLE "training_enrollments" ADD COLUMN "brief_kind" text;--> statement-breakpoint
ALTER TABLE "training_enrollments" ADD COLUMN "brief_date" date;--> statement-breakpoint
ALTER TABLE "training_enrollments" ADD COLUMN "brief_version" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "training_enrollments" ADD COLUMN "resign_date" date;--> statement-breakpoint
CREATE UNIQUE INDEX "doc_instances_doc_no_uq" ON "doc_instances" USING btree ("doc_no");