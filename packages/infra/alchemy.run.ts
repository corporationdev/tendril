import alchemy from "alchemy";
import {
  DurableObjectNamespace,
  Vite,
  Worker,
  WorkerLoader,
} from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const app = await alchemy("tendril");

const required = <Value>(value: Value | undefined, name: string): Value => {
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const tendrilThinkAgent = DurableObjectNamespace("tendril-think-agent", {
  className: "TendrilThinkAgent",
  sqlite: true,
});

export const web = await Vite("web", {
  cwd: "../../apps/web",
  assets: "dist",
  bindings: {
    VITE_SERVER_URL: required(alchemy.env.VITE_SERVER_URL, "VITE_SERVER_URL"),
  },
});

export const server = await Worker("server", {
  cwd: "../../apps/server",
  entrypoint: "src/index.ts",
  compatibility: "node",
  bindings: {
    DATABASE_URL: required(alchemy.secret.env.DATABASE_URL, "DATABASE_URL"),
    CORS_ORIGIN: required(alchemy.env.CORS_ORIGIN, "CORS_ORIGIN"),
    BETTER_AUTH_SECRET: required(
      alchemy.secret.env.BETTER_AUTH_SECRET,
      "BETTER_AUTH_SECRET"
    ),
    BETTER_AUTH_URL: required(alchemy.env.BETTER_AUTH_URL, "BETTER_AUTH_URL"),
    OPENAI_API_KEY: required(
      alchemy.secret.env.OPENAI_API_KEY,
      "OPENAI_API_KEY"
    ),
    LOADER: WorkerLoader(),
    TendrilThinkAgent: tendrilThinkAgent,
  },
  dev: {
    port: 3000,
  },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
