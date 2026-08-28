CREATE INDEX "ccollab_invited_by_idx" ON "client_collaborators" USING btree ("invited_by");--> statement-breakpoint
CREATE INDEX "coach_invites_used_by_idx" ON "coach_invites" USING btree ("used_by_client_user_id");--> statement-breakpoint
CREATE INDEX "comp_batches_approved_by_idx" ON "comp_batches" USING btree ("approved_by");--> statement-breakpoint
CREATE INDEX "comp_rank_events_operator_id_idx" ON "comp_rank_events" USING btree ("operator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comp_training_records_coach_evidence_uidx" ON "comp_training_records" USING btree ("coach_id","evidence") WHERE evidence is not null;--> statement-breakpoint
CREATE INDEX "comp_training_sessions_speaker_id_idx" ON "comp_training_sessions" USING btree ("speaker_id");