import { RpcTarget } from "cloudflare:workers";
import { type ModelMessage, type ToolSet, tool } from "ai";
import { z } from "zod";

const WORKSPACE_TOOL_NAMES = [
  "read",
  "write",
  "edit",
  "list",
  "find",
  "grep",
  "delete",
] as const;

type WorkspaceToolName = (typeof WORKSPACE_TOOL_NAMES)[number];

interface ExecuteResult {
  error?: string;
  logs?: string[];
  result: unknown;
}

interface SandboxToolInvoker {
  invoke(input: { path: string; args: unknown }): Promise<unknown>;
}

interface DynamicWorkerExecutorOptions {
  globalOutbound?: Fetcher | null;
  loader: WorkerLoader;
  timeoutMs?: number;
}

type WorkerRpcResponse =
  | {
      ok: true;
      result: unknown;
    }
  | {
      ok: false;
      error: string;
    };

interface DynamicWorkerEntrypoint {
  evaluate(dispatcher: ToolDispatcher): Promise<ExecuteResult>;
}

interface CreateExecuteToolOptions {
  abortSignal?: AbortSignal;
  loader: WorkerLoader;
  messages: ModelMessage[];
  timeoutMs?: number;
  tools: ToolSet;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const ENTRY_MODULE = "executor.js";
const EXECUTE_TOOL_CALL_ID_PREFIX = "execute-inner";
const FENCED_CODE_BLOCK_REGEX = /```(?:[^\n`]*)?\s*\n([\s\S]*?)```/i;
const EXPORT_DEFAULT_REGEX = /^export\s+default\s+/;
const WHITESPACE_REGEX = /\s+/;

const TOOL_DETAILS: Record<
  WorkspaceToolName,
  {
    description: string;
    inputTypeScript: string;
    outputTypeScript: string;
  }
> = {
  read: {
    description:
      "Read a workspace file. Text files return line-numbered content. Use offset and limit for large files.",
    inputTypeScript: "{ path: string; offset?: number; limit?: number }",
    outputTypeScript:
      "{ path: string; content: string; totalLines: number; fromLine?: number; toLine?: number } | { error: string } | { kind: string; path: string; name: string; mediaType: string; sizeBytes: number }",
  },
  write: {
    description: "Create or overwrite a workspace file with text content.",
    inputTypeScript: "{ path: string; content: string }",
    outputTypeScript: "{ path: string; bytesWritten: number; lines: number }",
  },
  edit: {
    description:
      "Replace a targeted string in a workspace file. Use exact old_string whenever possible.",
    inputTypeScript: "{ path: string; old_string: string; new_string: string }",
    outputTypeScript:
      "{ path: string; replaced?: boolean; created?: boolean; fuzzyMatch?: boolean; lines: number } | { error: string }",
  },
  list: {
    description: "List files in a workspace directory.",
    inputTypeScript: "{ path: string; limit?: number; offset?: number }",
    outputTypeScript: "{ path: string; count: number; entries: string[] }",
  },
  find: {
    description: "Search for workspace files by glob pattern.",
    inputTypeScript: "{ pattern: string }",
    outputTypeScript: "Record<string, unknown>",
  },
  grep: {
    description: "Search inside workspace files.",
    inputTypeScript:
      "{ query: string; include?: string; fixedString?: boolean; caseSensitive?: boolean; contextLines?: number }",
    outputTypeScript: "Record<string, unknown>",
  },
  delete: {
    description: "Remove workspace files or directories.",
    inputTypeScript: "{ path: string; recursive?: boolean }",
    outputTypeScript: "{ deleted: string }",
  },
};

const isWorkspaceToolName = (path: string): path is WorkspaceToolName =>
  (WORKSPACE_TOOL_NAMES as readonly string[]).includes(path);

const renderErrorMessage = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const extractCandidateSource = (code: string): string => {
  const trimmed = code.trim();
  const fenced = trimmed.match(FENCED_CODE_BLOCK_REGEX)?.[1];
  return (fenced ?? trimmed).trim();
};

const recoverExecutionBody = (code: string): string => {
  const source = extractCandidateSource(code).replace(EXPORT_DEFAULT_REGEX, "");

  if (
    source.startsWith("async") ||
    source.startsWith("(") ||
    source.startsWith("function")
  ) {
    return [
      "const __fn = (",
      source,
      ");",
      'if (typeof __fn !== "function") throw new Error("Code must evaluate to a function");',
      "return await __fn();",
    ].join("\n");
  }

  return source;
};

const buildExecutorModule = (body: string, timeoutMs: number): string =>
  [
    'import { WorkerEntrypoint } from "cloudflare:workers";',
    "",
    "export default class CodeExecutor extends WorkerEntrypoint {",
    "  async evaluate(__dispatcher) {",
    "    const __logs = [];",
    '    console.log = (...args) => { __logs.push(args.map(String).join(" ")); };',
    '    console.warn = (...args) => { __logs.push("[warn] " + args.map(String).join(" ")); };',
    '    console.error = (...args) => { __logs.push("[error] " + args.map(String).join(" ")); };',
    "    const __makeToolsProxy = (path = []) => new Proxy(() => undefined, {",
    "      get(_target, prop) {",
    "        if (prop === 'then' || typeof prop === 'symbol') return undefined;",
    "        return __makeToolsProxy([...path, String(prop)]);",
    "      },",
    "      apply(_target, _thisArg, args) {",
    "        const toolPath = path.join('.');",
    "        if (!toolPath) throw new Error('Tool path missing in invocation');",
    "        return (async () => {",
    "          const data = await __dispatcher.call(toolPath, args[0]);",
    "          if (!data.ok) throw new Error(data.error || 'Tool execution failed');",
    "          return data.result;",
    "        })();",
    "      },",
    "    });",
    "    const tools = __makeToolsProxy();",
    "",
    "    try {",
    "      const result = await Promise.race([",
    "        (async () => {",
    body,
    "        })(),",
    "        new Promise((_, reject) =>",
    `          setTimeout(() => reject(new Error("Execution timed out after ${timeoutMs}ms")), ${timeoutMs})`,
    "        ),",
    "      ]);",
    "      return { result, logs: __logs };",
    "    } catch (error) {",
    "      const message = error && typeof error === 'object' && 'message' in error ? error.message : String(error);",
    "      return { result: null, error: message, logs: __logs };",
    "    }",
    "  }",
    "}",
  ].join("\n");

class ToolDispatcher extends RpcTarget {
  readonly #invoker: SandboxToolInvoker;

  constructor(invoker: SandboxToolInvoker) {
    super();
    this.#invoker = invoker;
  }

  async call(path: string, args: unknown): Promise<WorkerRpcResponse> {
    try {
      const result = await this.#invoker.invoke({ path, args });
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: renderErrorMessage(error) };
    }
  }
}

const makeDynamicWorkerExecutor = (options: DynamicWorkerExecutorOptions) => {
  const timeoutMs = Math.max(100, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  return {
    execute: (
      code: string,
      toolInvoker: SandboxToolInvoker
    ): Promise<ExecuteResult> => {
      const body = recoverExecutionBody(code);
      const executorModule = buildExecutorModule(body, timeoutMs);
      const worker = options.loader.get(
        `executor-${crypto.randomUUID()}`,
        () => ({
          compatibilityDate: "2025-06-01",
          compatibilityFlags: ["nodejs_compat"],
          mainModule: ENTRY_MODULE,
          modules: {
            [ENTRY_MODULE]: executorModule,
          },
          globalOutbound: options.globalOutbound ?? null,
        })
      );
      const entrypoint =
        worker.getEntrypoint() as unknown as DynamicWorkerEntrypoint;

      return entrypoint.evaluate(new ToolDispatcher(toolInvoker));
    },
  };
};

const searchWorkspaceTools = (query: string, limit: number) => {
  const normalizedQuery = query.trim().toLowerCase();
  const matches = WORKSPACE_TOOL_NAMES.map((name) => {
    const details = TOOL_DETAILS[name];
    const haystack = `${name} ${details.description}`.toLowerCase();
    const score = normalizedQuery
      ? normalizedQuery
          .split(WHITESPACE_REGEX)
          .filter((term) => haystack.includes(term)).length
      : 0;

    return {
      path: name,
      name,
      description: details.description,
      score,
    };
  })
    .filter((item) => !normalizedQuery || item.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  return {
    items: matches.slice(0, limit),
    total: matches.length,
    hasMore: matches.length > limit,
    nextOffset: matches.length > limit ? limit : null,
  };
};

const createWorkspaceToolInvoker = (
  tools: ToolSet,
  options: {
    messages: ModelMessage[];
    abortSignal?: AbortSignal;
  }
): SandboxToolInvoker => ({
  invoke: async ({ path, args }) => {
    if (path === "search") {
      const input = z
        .object({
          query: z.string().optional(),
          limit: z.number().int().positive().max(20).optional(),
        })
        .parse(args);
      return searchWorkspaceTools(input.query ?? "", input.limit ?? 7);
    }

    if (path === "describe.tool") {
      const input = z.object({ path: z.string() }).parse(args);
      if (!isWorkspaceToolName(input.path)) {
        throw new Error(`Unknown tool: ${input.path}`);
      }

      return {
        path: input.path,
        name: input.path,
        ...TOOL_DETAILS[input.path],
      };
    }

    if (!isWorkspaceToolName(path)) {
      throw new Error(`Unknown tool: ${path}`);
    }

    const workspaceTool = tools[path];
    if (!workspaceTool?.execute) {
      throw new Error(`Tool is not executable: ${path}`);
    }

    return await workspaceTool.execute(args as never, {
      toolCallId: `${EXECUTE_TOOL_CALL_ID_PREFIX}-${crypto.randomUUID()}`,
      messages: options.messages,
      abortSignal: options.abortSignal,
    });
  },
});

const EXECUTE_DESCRIPTION = [
  "Execute JavaScript in an isolated dynamic Worker with access to Tendril workspace tools through a lazy `tools` proxy.",
  "",
  "Write an async arrow function, or write function-body JavaScript that returns a result.",
  "",
  "Workflow:",
  '1. Search for relevant tools: `const { items } = await tools.search({ query: "file contents" });`',
  "2. Describe a result before using it: `const details = await tools.describe.tool({ path: items[0].path });`",
  "3. Call the selected tool through the lazy proxy using the described input shape: `await tools[details.path](args)`.",
  "",
  "Do not use fetch; network access is blocked. Return the final answer or data from the function.",
].join("\n");

export const createWorkspaceExecuteTool = (options: CreateExecuteToolOptions) =>
  tool({
    description: EXECUTE_DESCRIPTION,
    inputSchema: z.object({
      code: z
        .string()
        .min(1)
        .describe(
          "JavaScript async arrow function or function body to execute"
        ),
    }),
    execute: async ({ code }) => {
      const executor = makeDynamicWorkerExecutor({
        loader: options.loader,
        timeoutMs: options.timeoutMs,
      });
      return await executor.execute(
        code,
        createWorkspaceToolInvoker(options.tools, {
          messages: options.messages,
          abortSignal: options.abortSignal,
        })
      );
    },
  });

export const getExecuteOnlySystemPrompt = () =>
  [
    "You are Tendril's default Think assistant.",
    "Be concise, practical, and helpful.",
    "",
    "You have exactly one callable tool: `execute`.",
    "Use `execute` whenever you need workspace file access.",
    "Inside `execute`, discover tools with `tools.search()`, inspect schemas and descriptions with `tools.describe.tool()`, then call the selected tool through the lazy `tools` proxy.",
    "Do not assume tool names from the prompt; discover the available tools at execution time.",
    "Do not try to call workspace tools directly from the chat turn; call discovered tools inside `execute`.",
  ].join("\n");
