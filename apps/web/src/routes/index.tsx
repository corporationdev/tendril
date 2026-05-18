import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { env } from "@tendril/env/web";
import { Button } from "@tendril/ui/components/button";
import { Input } from "@tendril/ui/components/input";
import { cn } from "@tendril/ui/lib/utils";
import { useAgent } from "agents/react";
import { Circle, MessageCircle, Plus, Send, Trash2 } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
  component: ChatRoute,
  beforeLoad: async () => {
    const session = await authClient.getSession();

    if (!session.data) {
      redirect({
        to: "/login",
        throw: true,
      });
    }
  },
});

interface TextPart {
  text?: string;
  type: string;
}

type AgentSession = Awaited<
  ReturnType<typeof client.agentSession.list>
>[number];

type ActiveChatTarget =
  | {
      draftId: string;
      kind: "draft";
    }
  | {
      id: string;
      kind: "session";
    };

interface PendingInitialMessage {
  sessionId: string;
  text: string;
}

const NEW_CHAT_TITLE = "New chat";

const createDraftTarget = (): ActiveChatTarget => ({
  draftId: crypto.randomUUID(),
  kind: "draft",
});

const getMessageText = (message: { parts: TextPart[] }) =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");

function SessionList({
  activeTarget,
  isLoading,
  onDeleteSession,
  onNewChat,
  onSelectSession,
  sessions,
}: {
  activeTarget: ActiveChatTarget | null;
  isLoading: boolean;
  onDeleteSession: (sessionId: string) => void;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  sessions: AgentSession[];
}) {
  const isDraftActive = activeTarget?.kind === "draft";
  let sessionListContent: ReactNode;

  if (isLoading) {
    sessionListContent = (
      <div className="px-2 py-3 text-muted-foreground text-xs">
        Loading chats...
      </div>
    );
  } else if (sessions.length === 0 && !isDraftActive) {
    sessionListContent = (
      <div className="px-2 py-3 text-muted-foreground text-xs">
        Start a new chat to create your first session.
      </div>
    );
  } else {
    sessionListContent = (
      <div className="flex flex-col gap-1">
        {sessions.map((session) => {
          const isActive =
            activeTarget?.kind === "session" && activeTarget.id === session.id;

          return (
            <div className="group/session relative" key={session.id}>
              <button
                className={cn(
                  "flex w-full min-w-0 flex-col gap-1 rounded-md px-2 py-2 pr-8 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
                onClick={() => onSelectSession(session.id)}
                type="button"
              >
                <span className="w-full truncate font-medium text-sm">
                  {session.title}
                </span>
              </button>
              <Button
                className="absolute top-2 right-1 opacity-0 group-focus-within/session:opacity-100 group-hover/session:opacity-100"
                onClick={() => onDeleteSession(session.id)}
                size="icon-xs"
                title="Delete chat"
                type="button"
                variant="ghost"
              >
                <Trash2 />
                <span className="sr-only">Delete chat</span>
              </Button>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <aside className="flex h-svh w-72 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center justify-between gap-2 border-b px-3">
        <div>
          <h1 className="font-semibold text-sm">Chats</h1>
          <p className="text-muted-foreground text-xs">Think sessions</p>
        </div>
        <Button
          onClick={onNewChat}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Plus />
          <span className="sr-only">New chat</span>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {isDraftActive && (
          <button
            className="mb-1 flex w-full min-w-0 items-center gap-2 rounded-md bg-sidebar-accent px-2 py-2 text-left text-sidebar-accent-foreground text-sm"
            type="button"
          >
            <MessageCircle className="size-4 shrink-0" />
            <span className="truncate">{NEW_CHAT_TITLE}</span>
          </button>
        )}

        {sessionListContent}
      </div>
    </aside>
  );
}

function DraftChatPane({
  onSubmit,
}: {
  onSubmit: (text: string) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const submitDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const text = input.trim();
    if (!text || isCreating) {
      return;
    }

    setIsCreating(true);
    try {
      await onSubmit(text);
      setInput("");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <ChatShell
      actions={null}
      input={
        <MessageForm
          disabled={isCreating}
          input={input}
          onInputChange={setInput}
          onSubmit={submitDraft}
          placeholder="Start a new chat..."
        />
      }
      statusLabel="draft"
      title={NEW_CHAT_TITLE}
    >
      <EmptyChatState>
        This draft will be saved when you send the first message.
      </EmptyChatState>
    </ChatShell>
  );
}

function SavedChatPane({
  onInitialMessageConsumed,
  pendingInitialMessage,
  session,
}: {
  onInitialMessageConsumed: () => void;
  pendingInitialMessage: PendingInitialMessage | null;
  session: AgentSession;
}) {
  const [input, setInput] = useState("");
  const initialMessageSentRef = useRef<string | null>(null);
  const agent = useAgent({
    agent: "TendrilThinkAgent",
    host: env.VITE_SERVER_URL,
    name: session.agentInstanceName,
  });

  const { clearHistory, isStreaming, messages, sendMessage, status } =
    useAgentChat({
      agent,
    });

  useEffect(() => {
    if (
      !pendingInitialMessage ||
      pendingInitialMessage.sessionId !== session.id ||
      initialMessageSentRef.current === pendingInitialMessage.sessionId
    ) {
      return;
    }

    initialMessageSentRef.current = pendingInitialMessage.sessionId;
    sendMessage({ text: pendingInitialMessage.text });
    onInitialMessageConsumed();
  }, [
    onInitialMessageConsumed,
    pendingInitialMessage,
    sendMessage,
    session.id,
  ]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const text = input.trim();
    if (!text) {
      return;
    }

    sendMessage({ text });
    setInput("");
  };

  return (
    <ChatShell
      actions={
        <Button
          onClick={clearHistory}
          size="icon"
          title="Clear chat"
          type="button"
          variant="ghost"
        >
          <Trash2 className="size-4" />
          <span className="sr-only">Clear chat</span>
        </Button>
      }
      input={
        <MessageForm
          disabled={false}
          input={input}
          onInputChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Send a message..."
        />
      }
      statusLabel={isStreaming ? "Streaming" : status}
      title={session.title}
    >
      {messages.length === 0 ? (
        <EmptyChatState>Ask Tendril anything.</EmptyChatState>
      ) : (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {messages.map((message) => {
            const isUser = message.role === "user";

            return (
              <article
                className={cn("flex", isUser ? "justify-end" : "justify-start")}
                key={message.id}
              >
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm",
                    isUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {getMessageText(message) || "Thinking..."}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </ChatShell>
  );
}

function ChatShell({
  actions,
  children,
  input,
  statusLabel,
  title,
}: {
  actions: ReactNode;
  children: ReactNode;
  input: ReactNode;
  statusLabel: string;
  title: string;
}) {
  return (
    <section className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center bg-primary text-primary-foreground">
              <MessageCircle className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-semibold text-lg">{title}</h1>
              <p className="truncate text-muted-foreground text-sm">
                Cloudflare Think assistant
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <output className="flex items-center gap-2 text-muted-foreground text-sm">
              <Circle
                className={cn(
                  "size-2 fill-current",
                  statusLabel === "ready"
                    ? "text-emerald-500"
                    : "text-amber-500"
                )}
              />
              {statusLabel}
            </output>
            {actions}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-6">{children}</div>
      <div className="border-t px-6 py-4">{input}</div>
    </section>
  );
}

function EmptyChatState({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-center text-muted-foreground text-sm">
      {children}
    </div>
  );
}

function MessageForm({
  disabled,
  input,
  onInputChange,
  onSubmit,
  placeholder,
}: {
  disabled: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <form className="mx-auto flex w-full max-w-3xl gap-2" onSubmit={onSubmit}>
      <Input
        aria-label="Message"
        autoComplete="off"
        disabled={disabled}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        value={input}
      />
      <Button disabled={disabled || !input.trim()} size="icon" type="submit">
        <Send className="size-4" />
        <span className="sr-only">Send message</span>
      </Button>
    </form>
  );
}

function ChatRoute() {
  const [activeTarget, setActiveTarget] = useState<ActiveChatTarget | null>(
    null
  );
  const [pendingInitialMessage, setPendingInitialMessage] =
    useState<PendingInitialMessage | null>(null);
  const sessionsQuery = useQuery(orpc.agentSession.list.queryOptions());
  const sessions = sessionsQuery.data ?? [];

  useEffect(() => {
    if (activeTarget || sessionsQuery.isLoading) {
      return;
    }

    setActiveTarget(
      sessions[0]
        ? { id: sessions[0].id, kind: "session" }
        : createDraftTarget()
    );
  }, [activeTarget, sessions, sessionsQuery.isLoading]);

  const activeSession = useMemo(() => {
    if (activeTarget?.kind !== "session") {
      return null;
    }

    return sessions.find((session) => session.id === activeTarget.id) ?? null;
  }, [activeTarget, sessions]);

  const handleNewChat = () => {
    setPendingInitialMessage(null);
    setActiveTarget(createDraftTarget());
  };

  const handleDeleteSession = async (sessionId: string) => {
    await client.agentSession.delete({ id: sessionId });
    const result = await sessionsQuery.refetch();
    const nextSessions =
      result.data?.filter((session) => session.id !== sessionId) ?? [];

    if (activeTarget?.kind === "session" && activeTarget.id === sessionId) {
      setActiveTarget(
        nextSessions[0]
          ? { id: nextSessions[0].id, kind: "session" }
          : createDraftTarget()
      );
    }
  };

  const handleDraftSubmit = async (text: string) => {
    try {
      const createdSession = await client.agentSession.create({
        firstMessage: text,
      });
      await sessionsQuery.refetch();
      setPendingInitialMessage({
        sessionId: createdSession.id,
        text,
      });
      setActiveTarget({
        id: createdSession.id,
        kind: "session",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create chat."
      );
      throw error;
    }
  };

  return (
    <main className="flex h-svh overflow-hidden bg-background">
      <SessionList
        activeTarget={activeTarget}
        isLoading={sessionsQuery.isLoading}
        onDeleteSession={(sessionId) => {
          handleDeleteSession(sessionId).catch((error: unknown) => {
            toast.error(
              error instanceof Error ? error.message : "Failed to delete chat."
            );
          });
        }}
        onNewChat={handleNewChat}
        onSelectSession={(sessionId) => {
          setPendingInitialMessage(null);
          setActiveTarget({ id: sessionId, kind: "session" });
        }}
        sessions={sessions}
      />

      {activeTarget?.kind === "draft" || !activeSession ? (
        <DraftChatPane onSubmit={handleDraftSubmit} />
      ) : (
        <SavedChatPane
          key={activeSession.id}
          onInitialMessageConsumed={() => setPendingInitialMessage(null)}
          pendingInitialMessage={pendingInitialMessage}
          session={activeSession}
        />
      )}
    </main>
  );
}
