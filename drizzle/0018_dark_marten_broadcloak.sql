CREATE TABLE "biz_tax_params" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"grp" text DEFAULT '稅率' NOT NULL,
	"unit" text DEFAULT 'rate' NOT NULL,
	"value" double precision NOT NULL,
	"basis" text,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
