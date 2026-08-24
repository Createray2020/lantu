CREATE TABLE "client_collaborators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"coach_id" text NOT NULL,
	"invited_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "client_collaborators" ADD CONSTRAINT "client_collaborators_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_collaborators" ADD CONSTRAINT "client_collaborators_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_collaborators" ADD CONSTRAINT "client_collaborators_invited_by_coaches_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ccollab_client_coach_uidx" ON "client_collaborators" USING btree ("client_id","coach_id");--> statement-breakpoint
CREATE INDEX "ccollab_coach_status_idx" ON "client_collaborators" USING btree ("coach_id","status");--> statement-breakpoint
CREATE INDEX "ccollab_client_id_idx" ON "client_collaborators" USING btree ("client_id");