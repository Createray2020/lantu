ALTER TABLE "clients" ALTER COLUMN "coach_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "client_user_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_client_user_id_client_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."client_users"("id") ON DELETE cascade ON UPDATE no action;