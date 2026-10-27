ALTER TABLE "coach_invites" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "coach_invites" ADD CONSTRAINT "coach_invites_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_invites_client_id_idx" ON "coach_invites" USING btree ("client_id");