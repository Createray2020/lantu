CREATE TABLE "house_params" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "house_price_params" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city" text NOT NULL,
	"district" text DEFAULT '' NOT NULL,
	"condition" text NOT NULL,
	"unit_price" double precision DEFAULT 0 NOT NULL,
	"parking_price" double precision DEFAULT 0 NOT NULL,
	"source" text,
	"basis" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "house_price_params_key_uq" ON "house_price_params" USING btree ("city","district","condition");--> statement-breakpoint
CREATE INDEX "house_price_params_city_idx" ON "house_price_params" USING btree ("city");