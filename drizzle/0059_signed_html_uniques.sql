DROP INDEX "invoices_case_idx";--> statement-breakpoint
ALTER TABLE "doc_instances" ADD COLUMN "signed_html" text;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_case_uq" ON "invoices" USING btree ("case_type","case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_cases_client_year_live_uq" ON "service_cases" USING btree ("client_id","service_year") WHERE status in ('open','completed');--> statement-breakpoint
CREATE UNIQUE INDEX "training_enrollments_coach_live_uq" ON "training_enrollments" USING btree ("coach_id") WHERE review_stage not in ('cancelled','rejected');