CREATE TABLE "acct_targets" (
	"ym" text PRIMARY KEY NOT NULL,
	"qty" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fixed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"net" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
