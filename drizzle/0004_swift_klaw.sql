CREATE TABLE "client_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
