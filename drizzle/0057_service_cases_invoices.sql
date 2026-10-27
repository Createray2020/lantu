CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_type" text NOT NULL,
	"case_id" text NOT NULL,
	"buyer_kind" text DEFAULT 'person' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"tax_id" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"carrier" text DEFAULT '' NOT NULL,
	"invoice_no" text DEFAULT '' NOT NULL,
	"issued_on" date,
	"amount" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"fail_reason" text DEFAULT '' NOT NULL,
	"handler_id" text,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"coach_id" text NOT NULL,
	"promo_coach_id" text,
	"case_no" text NOT NULL,
	"kind" text DEFAULT 'first' NOT NULL,
	"item_id" text NOT NULL,
	"item_name" text DEFAULT '' NOT NULL,
	"service_year" integer NOT NULL,
	"from_date" date,
	"to_date" date,
	"amount_due" double precision DEFAULT 0 NOT NULL,
	"tax_incl" boolean DEFAULT true NOT NULL,
	"signer_client_user_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_handler_id_coaches_id_fk" FOREIGN KEY ("handler_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_promo_coach_id_coaches_id_fk" FOREIGN KEY ("promo_coach_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_signer_client_user_id_client_users_id_fk" FOREIGN KEY ("signer_client_user_id") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_case_idx" ON "invoices" USING btree ("case_type","case_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "service_cases_client_idx" ON "service_cases" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "service_cases_coach_idx" ON "service_cases" USING btree ("coach_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_cases_case_no_uq" ON "service_cases" USING btree ("case_no");