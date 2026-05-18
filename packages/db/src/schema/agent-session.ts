import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const agentSession = pgTable(
  "agent_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    agentInstanceName: text("agent_instance_name").notNull(),
    title: text("title").notNull().default("New chat"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("agent_session_userId_idx").on(table.userId),
    uniqueIndex("agent_session_agentInstanceName_idx").on(
      table.agentInstanceName
    ),
  ]
);

export const agentSessionRelations = relations(agentSession, ({ one }) => ({
  user: one(user, {
    fields: [agentSession.userId],
    references: [user.id],
  }),
}));
