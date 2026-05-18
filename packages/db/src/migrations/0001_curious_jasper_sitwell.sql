CREATE TABLE "agent_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_name" text DEFAULT 'TendrilThinkAgent' NOT NULL,
	"agent_instance_name" text NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"last_message_preview" text,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_session_userId_idx" ON "agent_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_session_lastMessageAt_idx" ON "agent_session" USING btree ("last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_session_agentInstanceName_idx" ON "agent_session" USING btree ("agent_instance_name");
