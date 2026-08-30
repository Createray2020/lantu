ALTER TABLE "clients" ADD COLUMN "is_template" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "template_label" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "template_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "clients_template_order_idx" ON "clients" USING btree ("template_order","updated_at" DESC NULLS LAST) WHERE is_template;