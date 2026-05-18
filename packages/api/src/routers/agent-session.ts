import { createDb } from "@tendril/db";
import { agentSession } from "@tendril/db/schema/agent-session";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";

const DEFAULT_TITLE = "New chat";
const TITLE_MAX_LENGTH = 48;

const truncateText = (text: string, maxLength: number) => {
  const normalizedText = text.replace(/\s+/g, " ").trim();

  if (normalizedText.length <= maxLength) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, maxLength - 3)}...`;
};

const titleFromMessage = (message: string) =>
  truncateText(message, TITLE_MAX_LENGTH) || DEFAULT_TITLE;

export const agentSessionRouter = {
  list: protectedProcedure.handler(async ({ context }) => {
    const db = createDb();

    return await db
      .select({
        id: agentSession.id,
        agentInstanceName: agentSession.agentInstanceName,
        title: agentSession.title,
        createdAt: agentSession.createdAt,
      })
      .from(agentSession)
      .where(eq(agentSession.userId, context.session.user.id))
      .orderBy(desc(agentSession.createdAt));
  }),

  create: protectedProcedure
    .input(z.object({ firstMessage: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const db = createDb();
      const id = crypto.randomUUID();
      const values = {
        id,
        userId: context.session.user.id,
        agentInstanceName: `chat-${id}`,
        title: titleFromMessage(input.firstMessage),
      };

      const [createdSession] = await db
        .insert(agentSession)
        .values(values)
        .returning({
          id: agentSession.id,
          agentInstanceName: agentSession.agentInstanceName,
          title: agentSession.title,
          createdAt: agentSession.createdAt,
        });

      if (!createdSession) {
        throw new Error("Failed to create agent session.");
      }

      return createdSession;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const db = createDb();

      await db
        .delete(agentSession)
        .where(
          and(
            eq(agentSession.id, input.id),
            eq(agentSession.userId, context.session.user.id)
          )
        );

      return { id: input.id };
    }),
};
