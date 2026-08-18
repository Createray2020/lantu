CREATE INDEX "action_items_client_id_idx" ON "action_items" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "action_items_review_id_idx" ON "action_items" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "attachments_client_id_idx" ON "attachments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "clients_coach_id_updated_at_idx" ON "clients" USING btree ("coach_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "clients_client_user_id_uidx" ON "clients" USING btree ("client_user_id");--> statement-breakpoint
CREATE INDEX "coach_invites_coach_id_idx" ON "coach_invites" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "clr_coach_pending_idx" ON "coach_link_requests" USING btree ("coach_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "clr_client_id_idx" ON "coach_link_requests" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "clr_client_user_id_idx" ON "coach_link_requests" USING btree ("client_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clr_one_pending_per_client" ON "coach_link_requests" USING btree ("client_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "coaches_upline_id_idx" ON "coaches" USING btree ("upline_id");--> statement-breakpoint
CREATE INDEX "coaches_status_idx" ON "coaches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "member_metrics_coach_period_uidx" ON "member_metrics" USING btree ("coach_id","period");--> statement-breakpoint
CREATE INDEX "plan_revisions_plan_id_created_at_idx" ON "plan_revisions" USING btree ("plan_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "plans_client_id_year_idx" ON "plans" USING btree ("client_id","year" DESC NULLS LAST,"created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "plans_client_id_year_uidx" ON "plans" USING btree ("client_id","year");--> statement-breakpoint
CREATE INDEX "recruits_owner_coach_id_idx" ON "recruits" USING btree ("owner_coach_id");--> statement-breakpoint
CREATE INDEX "reviews_client_id_idx" ON "reviews" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "reviews_plan_id_idx" ON "reviews" USING btree ("plan_id");