import { createOpenAI } from "@ai-sdk/openai";
import type { TurnConfig, TurnContext } from "@cloudflare/think";
import { Think } from "@cloudflare/think";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@tendril/api/context";
import { appRouter } from "@tendril/api/routers/index";
import { createAuth } from "@tendril/auth";
import { env as serverEnv } from "@tendril/env/server";
import { getAgentByName, routeAgentRequest } from "agents";
import type { LanguageModel } from "ai";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  createWorkspaceExecuteTool,
  getExecuteOnlySystemPrompt,
} from "./execute-tool";

type ServerEnv = Cloudflare.Env & {
  OPENAI_API_KEY: string;
  LOADER: WorkerLoader;
  TendrilThinkAgent: DurableObjectNamespace<TendrilThinkAgent>;
};

const app = new Hono<{ Bindings: ServerEnv }>();

const withAgentRoomHeader = (request: Request, room: string) => {
  const nextRequest = new Request(request);
  nextRequest.headers.set("x-partykit-room", room);

  return nextRequest;
};

const isDurableObjectNamespace = (
  value: unknown
): value is DurableObjectNamespace<TendrilThinkAgent> =>
  typeof value === "object" &&
  value !== null &&
  "idFromName" in value &&
  typeof value.idFromName === "function";

const prepareAgentRequest = async (
  request: Request,
  env: ServerEnv,
  lobby: { className: string; name: string }
) => {
  const namespace = env[lobby.className as keyof ServerEnv];

  if (isDurableObjectNamespace(namespace)) {
    await getAgentByName(namespace, lobby.name);
  }

  return withAgentRoomHeader(request, lobby.name);
};

export class TendrilThinkAgent extends Think<ServerEnv> {
  getModel(): LanguageModel {
    const openai = createOpenAI({
      apiKey: this.env.OPENAI_API_KEY,
    });

    return openai("gpt-5.4-mini");
  }

  beforeTurn(ctx: TurnContext): TurnConfig {
    return {
      activeTools: ["execute"],
      system: getExecuteOnlySystemPrompt(),
      tools: {
        execute: createWorkspaceExecuteTool({
          loader: this.env.LOADER,
          tools: ctx.tools,
          messages: ctx.messages,
        }),
      },
      providerOptions: {
        openai: {
          reasoningEffort: "low",
        },
      },
    };
  }

  getSystemPrompt() {
    return getExecuteOnlySystemPrompt();
  }
}

app.use(logger());
app.use(
  "/*",
  cors({
    origin: serverEnv.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.on(["POST", "GET"], "/api/auth/*", (c) => createAuth().handler(c.req.raw));

app.use("/agents/*", async (c) => {
  const response = await routeAgentRequest(c.req.raw, c.env, {
    onBeforeConnect: (request, lobby) =>
      prepareAgentRequest(request, c.env, lobby),
    onBeforeRequest: (request, lobby) =>
      prepareAgentRequest(request, c.env, lobby),
  });

  return response ?? c.text("Agent not found", 404);
});

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/", (c) => c.text("OK"));

export default app;
