CREATE TABLE "birth_cost_params" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"grp" text DEFAULT '孕產' NOT NULL,
	"unit" text DEFAULT '次' NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"basis" text,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
