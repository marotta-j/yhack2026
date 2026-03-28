"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "lucide-react";
import Link from "next/link";
import { GlobeView, ArcData, MarkerData } from "@/components/Globe/GlobeView";
import { resolveDataCenter } from "@/lib/datacenterLocations";

interface Message {
  _id: string;
  role: "user" | "assistant";
  content: string;
  totalTokens?: number;
  createdAt: string;
}

interface Conversation {
  _id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

// Color used for the "you" marker and outbound arcs
const USER_COLOR = "#60a5fa"; // blue
// Color used for inbound (response) arcs
const INBOUND_ARC_COLOR = "#f97316"; // orange

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Globe state
  const [arcs, setArcs] = useState<ArcData[]>([]);
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Load conversation list
  useEffect(() => {
    fetchConversations();
  }, []);

  // Fetch user geolocation on mount and place the "You" marker
  useEffect(() => {
    fetch("/api/geolocate")
      .then((r) => r.json())
      .then((data) => {
        setUserLocation({ lat: data.lat, lng: data.lng });
        setMarkers([
          {
            id: "user",
            lat: data.lat,
            lng: data.lng,
            color: USER_COLOR,
            label: `You${data.city ? ` — ${data.city}` : ""}`,
            radius: 0.6,
            pulse: true,
          },
        ]);
      })
      .catch(() => {});
  }, []);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
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
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);

    // Optimistic user message
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { _id: tempId, role: "user", content: text, createdAt: new Date().toISOString() },
    ]);

    // ── Globe: outbound arc (user → data center) ─────────────────────────────
    const datacenter = resolveDataCenter("gpt-4o");
    const outArcId = `arc-out-${Date.now()}`;

    if (userLocation) {
      setArcs((prev) => [
        ...prev,
        {
          id: outArcId,
          startLat: userLocation.lat,
          startLng: userLocation.lng,
          endLat: datacenter.lat,
          endLng: datacenter.lng,
          color: USER_COLOR,
          animateTime: 1200,
        },
      ]);

      // Ensure data center marker is visible
      setMarkers((prev) => [
        ...prev.filter((m) => m.id !== "datacenter"),
        {
          id: "datacenter",
          lat: datacenter.lat,
          lng: datacenter.lng,
          color: datacenter.color,
          label: `${datacenter.name} — ${datacenter.provider}`,
          radius: 0.7,
          pulse: true,
        },
      ]);
    }
    // ─────────────────────────────────────────────────────────────────────────

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, content: text }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m._id !== tempId));
        // Remove outbound arc on error
        setArcs((prev) => prev.filter((a) => a.id !== outArcId));
        alert(data.error ?? "Something went wrong");
        return;
      }

      // ── Globe: inbound arc (data center → user) ─────────────────────────
      if (userLocation) {
        const inArcId = `arc-in-${Date.now()}`;
        setArcs((prev) => [
          ...prev.filter((a) => a.id !== outArcId), // remove outbound
          {
            id: inArcId,
            startLat: datacenter.lat,
            startLng: datacenter.lng,
            endLat: userLocation.lat,
            endLng: userLocation.lng,
            color: INBOUND_ARC_COLOR,
            animateTime: 1000,
          },
        ]);

        // Clear the inbound arc after ~2 full animation loops
        setTimeout(() => {
          setArcs((prev) => prev.filter((a) => a.id !== inArcId));
        }, 2500);
      }
      // ───────────────────────────────────────────────────────────────────────

      // Replace optimistic message + add assistant response
      setMessages((prev) => [
        ...prev.filter((m) => m._id !== tempId),
        data.userMessage,
        data.assistantMessage,
      ]);

      if (!activeId) {
        setActiveId(data.conversationId);
      }
      fetchConversations();
    } finally {
      setLoading(false);
    }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
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

        <ScrollArea className="flex-1 px-2">
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
        </ScrollArea>

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

      {/* ── Chat panel ───────────────────────────────────────────────────────── */}
      <main className="flex flex-col w-[440px] shrink-0 border-r border-border">
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
          <Badge variant="secondary" className="text-xs">GPT-4o</Badge>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4">
          <div className="max-w-full py-6 space-y-6">
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

            {messages.map((msg) => (
              <div
                key={msg._id}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <Avatar className="w-8 h-8 shrink-0 mt-0.5">
                  <AvatarFallback
                    className={cn(
                      "text-xs",
                      msg.role === "assistant"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <BotIcon className="w-4 h-4" />
                    ) : (
                      <UserIcon className="w-4 h-4" />
                    )}
                  </AvatarFallback>
                </Avatar>

                <div
                  className={cn(
                    "flex flex-col gap-1 max-w-[80%]",
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
                  </div>
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
                </div>
              </div>
            ))}

            {loading && (
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
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border p-4 shrink-0">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message GPT-4o..."
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
            Powered by Lava Gateway · OpenAI GPT-4o
          </p>
        </div>
      </main>

      {/* ── Globe panel ──────────────────────────────────────────────────────── */}
      <div className="flex-1 bg-black relative overflow-hidden">
        <GlobeView arcs={arcs} markers={markers} autoRotate />

        {/* Overlay: arc legend (only shown while arcs are active) */}
        {arcs.length > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 text-xs text-white pointer-events-none">
            {arcs.some((a) => a.color === USER_COLOR) && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: USER_COLOR }} />
                Sending request
              </span>
            )}
            {arcs.some((a) => a.color === INBOUND_ARC_COLOR) && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: INBOUND_ARC_COLOR }} />
                Receiving response
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
