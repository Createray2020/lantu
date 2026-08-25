CREATE TABLE "an_module_defaults" (
	"key" text PRIMARY KEY NOT NULL,
	"sort_order" integer NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
