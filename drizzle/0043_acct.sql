CREATE TABLE "acct_months" (
	"ym" text PRIMARY KEY NOT NULL,
	"qty" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fixed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acct_params" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
