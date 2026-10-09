CREATE TABLE "payees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" text,
	"name" text DEFAULT '' NOT NULL,
	"bank_code" text DEFAULT '' NOT NULL,
	"bank_name" text DEFAULT '' NOT NULL,
	"branch" text DEFAULT '' NOT NULL,
	"account_name" text DEFAULT '' NOT NULL,
	"account_no" text DEFAULT '' NOT NULL,
	"tax_mode" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payees" ADD CONSTRAINT "payees_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payees_coach_uq" ON "payees" USING btree ("coach_id");