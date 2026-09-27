CREATE TABLE "car_params" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "car_price_params" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" text NOT NULL,
	"segment" text NOT NULL,
	"power" text NOT NULL,
	"price" double precision DEFAULT 0 NOT NULL,
	"source" text,
	"basis" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "car_price_params_key_uq" ON "car_price_params" USING btree ("brand","segment","power");--> statement-breakpoint
CREATE INDEX "car_price_params_brand_idx" ON "car_price_params" USING btree ("brand");