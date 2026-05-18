import { useAgentChat } from "@cloudflare/ai-chat/react";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "@tendril/env/web";
import { Button } from "@tendril/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@tendril/ui/components/card";
import { Input } from "@tendril/ui/components/input";
import { useAgent } from "agents/react";
import { Circle, MessageCircle, Send, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

export const Route = createFileRoute("/")({
  component: ChatRoute,
});

interface TextPart {
  text?: string;
  type: string;
}

const getMessageText = (message: { parts: TextPart[] }) =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");

function ChatRoute() {
  const [input, setInput] = useState("");
  const agent = useAgent({
    agent: "TendrilThinkAgent",
    host: env.VITE_SERVER_URL,
    name: "default",
  });

  const { clearHistory, isStreaming, messages, sendMessage, status } =
    useAgentChat({
      agent,
    });

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
    <main className="flex h-svh flex-col bg-background">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center bg-primary text-primary-foreground">
              <MessageCircle className="size-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Chat</h1>
              <p className="text-muted-foreground text-sm">
                Default Cloudflare Think assistant on the main Worker
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <output className="flex items-center gap-2 text-muted-foreground text-sm">
              <Circle
                className={`size-2 fill-current ${
                  status === "ready" ? "text-emerald-500" : "text-amber-500"
                }`}
              />
              {isStreaming ? "Streaming" : status}
            </output>
            <Button
              onClick={clearHistory}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 className="size-4" />
              <span className="sr-only">Clear chat</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {messages.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Start a conversation</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                Ask Tendril anything. Its chat history persists in the server
                Worker Durable Object.
              </CardContent>
            </Card>
          ) : (
            messages.map((message) => {
              const isUser = message.role === "user";

              return (
                <article
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  key={message.id}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm ${
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {getMessageText(message) || "Thinking..."}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>

      <form className="border-t px-6 py-4" onSubmit={handleSubmit}>
        <div className="mx-auto flex w-full max-w-3xl gap-2">
          <Input
            aria-label="Message"
            autoComplete="off"
            onChange={(event) => setInput(event.target.value)}
            placeholder="Send a message..."
            value={input}
          />
          <Button disabled={!input.trim()} size="icon" type="submit">
            <Send className="size-4" />
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </form>
    </main>
  );
}
