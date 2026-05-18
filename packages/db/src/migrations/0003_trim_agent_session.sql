DROP INDEX IF EXISTS "agent_session_lastMessageAt_idx";--> statement-breakpoint
ALTER TABLE "agent_session" DROP COLUMN IF EXISTS "agent_name";--> statement-breakpoint
ALTER TABLE "agent_session" DROP COLUMN IF EXISTS "last_message_preview";--> statement-breakpoint
ALTER TABLE "agent_session" DROP COLUMN IF EXISTS "last_message_at";--> statement-breakpoint
ALTER TABLE "agent_session" DROP COLUMN IF EXISTS "archived_at";--> statement-breakpoint
ALTER TABLE "agent_session" DROP COLUMN IF EXISTS "updated_at";
