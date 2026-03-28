"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PlusIcon,
  SendIcon,
  MessageSquareIcon,
  BarChart2Icon,
  BotIcon,
  UserIcon,
  LoaderIcon,
  ZapIcon,
} from "lucide-react";
import Link from "next/link";

interface Message {
  _id: string;
  role: "user" | "assistant";
  content: string;
  totalTokens?: number;
  createdAt: string;
  streaming?: boolean;
  rightsizingModel?: string;
}

interface Conversation {
  _id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isStreamingRef = useRef(false);

  // Load conversation list
  useEffect(() => {
    fetchConversations();
  }, []);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    if (isStreamingRef.current) return; // don't overwrite local state mid-stream
    setLoadingMessages(true);
    fetch(`/api/conversations/${activeId}/messages`)
      .then((r) => r.json())
      .then((data) => setMessages(data))
      .finally(() => setLoadingMessages(false));
  }, [activeId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function fetchConversations() {
    const res = await fetch("/api/conversations");
    const data = await res.json();
    setConversations(data);
  }

  async function handleNewChat() {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setSelectedModel(null);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);
    isStreamingRef.current = true;

    // Optimistic user message
    const tempId = `temp-${Date.now()}`;
    const streamingId = `streaming-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { _id: tempId, role: "user", content: text, createdAt: new Date().toISOString() },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, content: text }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setMessages((prev) => prev.filter((m) => m._id !== tempId));
        alert(data.error ?? "Something went wrong");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);

            if (event.type === "model") {
              setSelectedModel(event.model);
              if (!activeId) setActiveId(event.conversationId);
              setMessages((prev) => [
                ...prev.filter((m) => m._id !== tempId),
                event.userMessage,
                // Rightsizing notice
                {
                  _id: `rightsizing-${streamingId}`,
                  role: "assistant",
                  content: "",
                  rightsizingModel: event.model,
                  createdAt: new Date().toISOString(),
                },
                // Streaming assistant bubble
                {
                  _id: streamingId,
                  role: "assistant",
                  content: "",
                  streaming: true,
                  createdAt: new Date().toISOString(),
                },
              ]);
            } else if (event.type === "delta") {
              setMessages((prev) =>
                prev.map((m) =>
                  m._id === streamingId
                    ? { ...m, content: m.content + event.content }
                    : m,
                ),
              );
            } else if (event.type === "done") {
              setMessages((prev) => [
                ...prev.filter((m) => m._id !== streamingId),
                event.assistantMessage,
              ]);
              fetchConversations();
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.filter((m) => m._id !== tempId && m._id !== streamingId),
              );
              alert(event.error ?? "Something went wrong");
            }
          } catch {
            // skip malformed line
          }
        }
      }
    } finally {
      isStreamingRef.current = false;
      setLoading(false);
    }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const isStreaming = messages.some((m) => m.streaming);

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col border-r border-border bg-card shrink-0">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BotIcon className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">Leaf Chat</span>
          </div>
        </div>

        <div className="p-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleNewChat}
          >
            <PlusIcon className="w-4 h-4" />
            New Chat
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-2">
          <div className="space-y-1 pb-2">
            {conversations.map((conv) => (
              <button
                key={conv._id}
                onClick={() => setActiveId(conv._id)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  activeId === conv._id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                )}
              >
                <div className="flex items-center gap-2">
                  <MessageSquareIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{conv.title}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 pl-5">
                  {conv.messageCount} messages
                </p>
              </button>
            ))}
          </div>
        </div>

        <Separator />
        <div className="p-3">
          <Link href="/stats">
            <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground">
              <BarChart2Icon className="w-4 h-4" />
              Statistics
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            {activeId ? (
              <h1 className="font-semibold">
                {conversations.find((c) => c._id === activeId)?.title ?? "Chat"}
              </h1>
            ) : (
              <h1 className="font-semibold text-muted-foreground">New Conversation</h1>
            )}
          </div>
          <Badge variant="secondary" className="text-xs">{selectedModel ?? "—"}</Badge>
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4">
          <div className="max-w-3xl mx-auto py-6 space-y-6">
            {!activeId && messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
                <BotIcon className="w-12 h-12 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">
                  Start a conversation. Ask anything.
                </p>
              </div>
            )}

            {loadingMessages && (
              <div className="flex justify-center py-8">
                <LoaderIcon className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {messages.map((msg) => {
              // Rightsizing notice — rendered as a small centered label
              if (msg.rightsizingModel) {
                return (
                  <div key={msg._id} className="flex items-center justify-center gap-2">
                    <ZapIcon className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Rightsizing: <span className="font-medium text-foreground">{msg.rightsizingModel}</span> selected for this prompt
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={msg._id}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <Avatar className="w-8 h-8 shrink-0 mt-0.5">
                    <AvatarFallback className={cn(
                      "text-xs",
                      msg.role === "assistant"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {msg.role === "assistant" ? (
                        <BotIcon className="w-4 h-4" />
                      ) : (
                        <UserIcon className="w-4 h-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>

                  <div
                    className={cn(
                      "flex flex-col gap-1 max-w-[75%]",
                      msg.role === "user" ? "items-end" : "items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted text-foreground rounded-tl-sm"
                      )}
                    >
                      {msg.content}
                      {msg.streaming && (
                        <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-foreground/50 animate-pulse rounded-sm align-middle" />
                      )}
                    </div>
                    {!msg.streaming && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatTime(msg.createdAt)}
                        </span>
                        {msg.totalTokens && msg.totalTokens > 0 && (
                          <span className="text-xs text-muted-foreground">
                            · {msg.totalTokens} tokens
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Typing dots — only while waiting for the first stream event */}
            {loading && !isStreaming && (
              <div className="flex gap-3">
                <Avatar className="w-8 h-8 shrink-0 mt-0.5">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    <BotIcon className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-border p-4 shrink-0">
          <form
            className="max-w-3xl mx-auto flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message..."
              className="flex-1"
              disabled={loading}
              autoFocus
            />
            <Button type="submit" disabled={!input.trim() || loading} size="icon">
              {loading ? (
                <LoaderIcon className="w-4 h-4 animate-spin" />
              ) : (
                <SendIcon className="w-4 h-4" />
              )}
            </Button>
          </form>
          <p className="text-xs text-center text-muted-foreground mt-2">
            Powered by Lava Gateway{selectedModel ? ` · ${selectedModel}` : ""}
          </p>
        </div>
      </main>
    </div>
  );
}
