import { neon } from "@neondatabase/serverless";
import { env } from "@tendril/env/server";
import { drizzle } from "drizzle-orm/neon-http";

import { agentSession, agentSessionRelations } from "./schema/agent-session";
import {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "./schema/auth";

const schema = {
  account,
  accountRelations,
  agentSession,
  agentSessionRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
};

export function createDb() {
  const sql = neon(env.DATABASE_URL || "");
  return drizzle(sql, { schema });
}
