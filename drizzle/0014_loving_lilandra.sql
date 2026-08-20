ALTER TABLE "clients" DROP CONSTRAINT "clients_coach_id_coaches_id_fk";
--> statement-breakpoint
ALTER TABLE "comp_cases" DROP CONSTRAINT "comp_cases_executor_id_coaches_id_fk";
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_cases" ADD CONSTRAINT "comp_cases_executor_id_coaches_id_fk" FOREIGN KEY ("executor_id") REFERENCES "public"."coaches"("id") ON DELETE restrict ON UPDATE no action;