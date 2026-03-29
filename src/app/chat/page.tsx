"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  LayersIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TrashIcon,
} from "lucide-react";
import Link from "next/link";
import { GlobeView, ArcData, MarkerData } from "@/components/Globe/GlobeView";
import { LocationOverridePanel } from "@/components/LocationOverride/LocationOverridePanel";
import {
  readLocationOverride,
  writeLocationOverride,
  clearLocationOverrideStorage,
  type StoredLocationOverride,
  type ResolvedGeo,
} from "@/lib/locationOverrideStorage";
import {
  resolveClosestDataCenter,
  resolveDataCenter,
  ALL_DATA_CENTERS,
  ALL_PROVIDERS,
  PROVIDER_COLORS,
  MODEL_PROVIDERS,
} from "@/lib/datacenterLocations";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_COLOR = "#60a5fa";

/** DC count per provider — used in the toggle badge. */
const PROVIDER_COUNTS = ALL_PROVIDERS.reduce<Record<string, number>>((acc, p) => {
  acc[p] = ALL_DATA_CENTERS.filter((d) => d.provider === p).length;
  return acc;
}, {});

/** Which model names use each provider (for the sub-label in the toggle). */
const PROVIDER_MODELS: Record<string, string[]> = {};
for (const [model, providers] of Object.entries(MODEL_PROVIDERS)) {
  for (const p of providers) {
    if (!PROVIDER_MODELS[p]) PROVIDER_MODELS[p] = [];
    PROVIDER_MODELS[p].push(model);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

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

  // Per-conversation globe snapshots (static arcs + active DC markers)
  const convGlobeRef = useRef<Record<string, { arcs: ArcData[]; dcMarkers: MarkerData[] }>>({});
  const prevActiveIdRef = useRef<string | null>(null);
  // Tracks which conversation ID is currently being streamed (may differ from activeId)
  const streamingConvIdRef = useRef<string | null>(null);

  // Globe state
  const [arcs, setArcs] = useState<ArcData[]>([]);
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  // Ref so async streaming handler always sees the latest coordinates
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  // Provider toggle — all on by default
  const [enabledProviders, setEnabledProviders] = useState<Set<string>>(
    () => new Set(ALL_PROVIDERS),
  );
  const [togglePanelOpen, setTogglePanelOpen] = useState(true);

  /** True geolocation from /api/geolocate (your IP). */
  const [realLocation, setRealLocation] = useState<ResolvedGeo | null>(null);
  /** Optional spoof — persisted in localStorage, drives pin + routing. */
  const [locationOverride, setLocationOverride] = useState<StoredLocationOverride | null>(null);

  // ── Load conversation list ──────────────────────────────────────────────────
  useEffect(() => {
    fetchConversations();
  }, []);

  // ── Restore saved location override (client only) ──────────────────────────
  useEffect(() => {
    const stored = readLocationOverride();
    if (stored) setLocationOverride(stored);
  }, []);

  // ── Resolve real IP → coordinates ───────────────────────────────────────────
  useEffect(() => {
    fetch("/api/geolocate")
      .then((r) => r.json())
      .then((data) => {
        setRealLocation({
          lat: data.lat,
          lng: data.lng,
          city: data.city ?? "",
          country: data.country ?? "",
          ip: data.ip ?? "",
        });
      })
      .catch(() => {});
  }, []);

  // ── Sync effective position: override ?? real ─────────────────────────────
  useEffect(() => {
    const effective = locationOverride ?? realLocation;
    if (!effective) return;

    const loc = { lat: effective.lat, lng: effective.lng };
    setUserLocation(loc);
    userLocationRef.current = loc;

    const label = locationOverride
      ? `You — ${effective.city}${effective.country ? `, ${effective.country}` : ""} (mock)`
      : `You${effective.city ? ` — ${effective.city}` : ""}`;

    setMarkers((prev) => {
      const rest = prev.filter((m) => m.id !== "user");
      return [
        ...rest,
        {
          id: "user",
          lat: loc.lat,
          lng: loc.lng,
          color: USER_COLOR,
          label,
          radius: 0.6,
          pulse: true,
        },
      ];
    });
  }, [realLocation, locationOverride]);

  function applyLocationOverride(loc: StoredLocationOverride) {
    writeLocationOverride(loc);
    setLocationOverride(loc);
  }

  function clearLocationOverride() {
    clearLocationOverrideStorage();
    setLocationOverride(null);
  }

  // ── Save/restore per-conversation globe state when active conversation changes ─
  useEffect(() => {
    // Snapshot the outgoing conversation's globe state (arcs/markers captured at
    // the moment activeId changes, before any clearing happens)
    const leavingId = prevActiveIdRef.current;
    if (leavingId) {
      convGlobeRef.current[leavingId] = {
        arcs: arcs.filter((a) => a.static),
        dcMarkers: markers.filter((m) => m.id.startsWith("dc-")),
      };
    }
    prevActiveIdRef.current = activeId;

    if (!activeId) {
      setArcs([]);
      setMarkers((prev) => prev.filter((m) => m.id === "user"));
      return;
    }

    // Don't restore globe state mid-stream — the in-flight arcs are already correct
    if (isStreamingRef.current) return;

    const saved = convGlobeRef.current[activeId];
    if (saved) {
      // Already cached in this session — restore immediately
      setArcs(saved.arcs);
      setMarkers((prev) => {
        const userMarker = prev.find((m) => m.id === "user");
        return userMarker ? [...saved.dcMarkers, userMarker] : [...saved.dcMarkers];
      });
    } else {
      // Not in memory (page refresh) — load from DB
      let cancelled = false;
      fetch(`/api/conversations/${activeId}`)
        .then((r) => r.json())
        .then((conv) => {
          if (cancelled) return;
          const state: { arcs: ArcData[]; dcMarkers: MarkerData[] } =
            conv.globeState ?? { arcs: [], dcMarkers: [] };
          convGlobeRef.current[activeId] = state;
          setArcs(state.arcs);
          setMarkers((prev) => {
            const userMarker = prev.find((m) => m.id === "user");
            return userMarker ? [...state.dcMarkers, userMarker] : [...state.dcMarkers];
          });
        })
        .catch(() => {});
      return () => { cancelled = true; };
    }
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load messages when active conversation changes ──────────────────────────
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    if (isStreamingRef.current) return;
    setLoadingMessages(true);
    fetch(`/api/conversations/${activeId}/messages`)
      .then((r) => r.json())
      .then((data) => setMessages(data))
      .finally(() => setLoadingMessages(false));
  }, [activeId]);

  // ── Persist globe state to DB after each message completes ─────────────────
  // Runs when `loading` transitions false → captures the arcs/markers from that
  // render (which already include the new static arc added during the "done" event).
  useEffect(() => {
    if (loading) return;
    const convId = streamingConvIdRef.current;
    if (!convId) return;
    const staticArcs = arcs.filter((a) => a.static);
    const dcMarkers = markers.filter((m) => m.id.startsWith("dc-"));
    const state = { arcs: staticArcs, dcMarkers };
    convGlobeRef.current[convId] = state; // keep in-memory cache in sync
    fetch(`/api/conversations/${convId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ globeState: state }),
    }).catch(() => {});
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll to bottom on new messages ───────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Background DC markers recomputed whenever the toggle changes ────────────
  const bgDcMarkers = useMemo<MarkerData[]>(() => {
    return ALL_DATA_CENTERS.filter((d) => enabledProviders.has(d.provider)).map((d) => ({
      id: `bg-${d.id}`,
      lat: d.lat,
      lng: d.lng,
      color: d.color,
      label: `${d.name} — ${d.provider}${d.region ? ` (${d.region})` : ""}`,
      radius: 0.28,
      altitude: 0.004,
      pulse: false,
    }));
  }, [enabledProviders]);

  const allMarkers = useMemo<MarkerData[]>(
    () => [...bgDcMarkers, ...markers],
    [bgDcMarkers, markers],
  );

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function fetchConversations() {
    const res = await fetch("/api/conversations");
    const data = await res.json();
    setConversations(data);
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    delete convGlobeRef.current[id];
    setConversations((prev) => prev.filter((c) => c._id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  }

  async function handleNewChat() {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setSelectedModel(null);
  }

  function toggleProvider(provider: string) {
    setEnabledProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  }

  function toggleAllProviders() {
    setEnabledProviders((prev) =>
      prev.size === ALL_PROVIDERS.length ? new Set() : new Set(ALL_PROVIDERS),
    );
  }

  // ── Send message ───────────────────────────────────────────────────────────

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);
    isStreamingRef.current = true;

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

      let outArcId: string | null = null;
      let currentDatacenter = resolveDataCenter("gpt-4o");

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

            // ── model event ────────────────────────────────────────────────
            if (event.type === "model") {
              setSelectedModel(event.model);
              streamingConvIdRef.current = event.conversationId;
              if (!activeId) setActiveId(event.conversationId);
              setMessages((prev) => [
                ...prev.filter((m) => m._id !== tempId),
                event.userMessage,
                {
                  _id: `rightsizing-${streamingId}`,
                  role: "assistant",
                  content: "",
                  rightsizingModel: event.model,
                  createdAt: new Date().toISOString(),
                },
                {
                  _id: streamingId,
                  role: "assistant",
                  content: "",
                  streaming: true,
                  createdAt: new Date().toISOString(),
                },
              ]);

              // Globe: arc to the CLOSEST data center for this model
              const loc = userLocationRef.current;
              if (loc) {
                currentDatacenter = resolveClosestDataCenter(event.model, loc.lat, loc.lng);
                outArcId = `arc-out-${Date.now()}`;
                setArcs((prev) => [
                  ...prev,
                  {
                    id: outArcId!,
                    startLat: loc.lat,
                    startLng: loc.lng,
                    endLat: currentDatacenter.lat,
                    endLng: currentDatacenter.lng,
                    color: currentDatacenter.color,
                    animateTime: 1200,
                  },
                ]);
                setMarkers((prev) => {
                  const dcId = `dc-${currentDatacenter.id}`;
                  if (prev.some((m) => m.id === dcId)) return prev;
                  return [
                    ...prev,
                    {
                      id: dcId,
                      lat: currentDatacenter.lat,
                      lng: currentDatacenter.lng,
                      color: currentDatacenter.color,
                      label: `${currentDatacenter.name} — ${currentDatacenter.provider}`,
                      radius: 0.7,
                      pulse: true,
                    },
                  ];
                });
              }

            // ── delta event ────────────────────────────────────────────────
            } else if (event.type === "delta") {
              setMessages((prev) =>
                prev.map((m) =>
                  m._id === streamingId
                    ? { ...m, content: m.content + event.content }
                    : m,
                ),
              );

            // ── done event ─────────────────────────────────────────────────
            } else if (event.type === "done") {
              setMessages((prev) => [
                ...prev
                  .filter((m) => m._id !== streamingId)
                  .map((m) =>
                    m._id === event.userMessageId
                      ? { ...m, totalTokens: event.userMessageTokens }
                      : m,
                  ),
                event.assistantMessage,
              ]);
              fetchConversations();

              const loc = userLocationRef.current;
              if (loc && outArcId) {
                const staticArcId = `arc-static-${Date.now()}`;
                const inArcId = `arc-in-${Date.now()}`;
                setArcs((prev) => [
                  ...prev.filter((a) => a.id !== outArcId),
                  {
                    id: staticArcId,
                    startLat: loc.lat,
                    startLng: loc.lng,
                    endLat: currentDatacenter.lat,
                    endLng: currentDatacenter.lng,
                    color: currentDatacenter.color,
                    static: true,
                  },
                  {
                    id: inArcId,
                    startLat: currentDatacenter.lat,
                    startLng: currentDatacenter.lng,
                    endLat: loc.lat,
                    endLng: loc.lng,
                    color: currentDatacenter.color,
                    animateTime: 900,
                  },
                ]);
                setTimeout(() => {
                  setArcs((prev) => prev.filter((a) => a.id !== inArcId));
                }, 1600);
              }

            // ── error event ────────────────────────────────────────────────
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.filter((m) => m._id !== tempId && m._id !== streamingId),
              );
              if (outArcId) setArcs((prev) => prev.filter((a) => a.id !== outArcId));
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

  // The DC shown in the bottom legend (uses real user location when available)
  const activeDc = selectedModel
    ? userLocation
      ? resolveClosestDataCenter(selectedModel, userLocation.lat, userLocation.lng)
      : resolveDataCenter(selectedModel)
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

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

        <div className="flex-1 min-h-0 overflow-y-auto px-2">
          <div className="space-y-1 pb-2">
            {conversations.map((conv) => (
              <div
                key={conv._id}
                className={cn(
                  "group relative flex items-center rounded-md text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  activeId === conv._id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground",
                )}
              >
                <button
                  onClick={() => setActiveId(conv._id)}
                  className="flex-1 text-left px-3 py-2 min-w-0"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquareIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{conv.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 pl-5">
                    {conv.messageCount} messages
                  </p>
                </button>
                <button
                  onClick={(e) => deleteConversation(conv._id, e)}
                  className="shrink-0 p-1.5 mr-1 rounded opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                  aria-label="Delete conversation"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <Separator />
        <div className="p-3">
          <Link href="/stats">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-muted-foreground"
            >
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
          <Badge variant="secondary" className="text-xs">
            {selectedModel ?? "—"}
          </Badge>
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
              if (msg.rightsizingModel) {
                return (
                  <div key={msg._id} className="flex items-center justify-center gap-2">
                    <ZapIcon className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Rightsizing:{" "}
                      <span className="font-medium text-foreground">
                        {msg.rightsizingModel}
                      </span>{" "}
                      selected for this prompt
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={msg._id}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "flex-row-reverse" : "flex-row",
                  )}
                >
                  <Avatar className="w-8 h-8 shrink-0 mt-0.5">
                    <AvatarFallback
                      className={cn(
                        "text-xs",
                        msg.role === "assistant"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
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
                      "flex flex-col gap-1 max-w-[75%]",
                      msg.role === "user" ? "items-end" : "items-start",
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted text-foreground rounded-tl-sm",
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
            className="flex gap-2"
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

      {/* ── Globe panel ──────────────────────────────────────────────────────── */}
      <div className="flex-1 bg-black relative overflow-hidden">
        <GlobeView arcs={arcs} markers={allMarkers} autoRotate initialPointOfView={userLocation ?? undefined} />

        {/* ── Provider toggle panel ───────────────────────────────────────── */}
        <div className="absolute top-4 right-4 z-10 w-52">

          {/* Header / collapse button */}
          <button
            onClick={() => setTogglePanelOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 text-white hover:bg-black/80 transition-colors"
          >
            <div className="flex items-center gap-2">
              <LayersIcon className="w-3.5 h-3.5 text-white/60" />
              <span className="text-xs font-semibold tracking-wide">Data Centers</span>
              <span className="text-[10px] text-white/40">
                {enabledProviders.size}/{ALL_PROVIDERS.length}
              </span>
            </div>
            {togglePanelOpen
              ? <ChevronUpIcon className="w-3.5 h-3.5 text-white/50" />
              : <ChevronDownIcon className="w-3.5 h-3.5 text-white/50" />
            }
          </button>

          {/* Provider rows */}
          {togglePanelOpen && (
            <div className="mt-1 bg-black/70 backdrop-blur-sm rounded-xl overflow-hidden">

              {/* All / None shortcut */}
              <button
                onClick={toggleAllProviders}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors border-b border-white/10"
              >
                <span className="uppercase tracking-widest">Providers</span>
                <span className="underline underline-offset-2">
                  {enabledProviders.size === ALL_PROVIDERS.length ? "Hide all" : "Show all"}
                </span>
              </button>

              {ALL_PROVIDERS.map((provider) => {
                const on = enabledProviders.has(provider);
                const models = PROVIDER_MODELS[provider] ?? [];
                return (
                  <button
                    key={provider}
                    onClick={() => toggleProvider(provider)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all hover:bg-white/5",
                      on ? "opacity-100" : "opacity-35",
                    )}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/20"
                      style={{ background: PROVIDER_COLORS[provider] }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs text-white font-medium truncate">
                          {provider}
                        </span>
                        <span
                          className="text-[10px] shrink-0 tabular-nums"
                          style={{ color: PROVIDER_COLORS[provider] + "bb" }}
                        >
                          {PROVIDER_COUNTS[provider]}
                        </span>
                      </div>
                      {models.length > 0 && (
                        <p className="text-[10px] text-white/35 truncate">
                          {models.join(", ")}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Total count footer */}
              <div className="px-3 py-1.5 border-t border-white/10 flex items-center justify-between">
                <span className="text-[10px] text-white/30">Visible DCs</span>
                <span className="text-[10px] text-white/50 tabular-nums font-medium">
                  {ALL_DATA_CENTERS.filter((d) => enabledProviders.has(d.provider)).length}
                  {" / "}
                  {ALL_DATA_CENTERS.length}
                </span>
              </div>
            </div>
          )}
        </div>

        <LocationOverridePanel
          realLocation={realLocation}
          override={locationOverride}
          onApplyOverride={applyLocationOverride}
          onClearOverride={clearLocationOverride}
        />

        {locationOverride && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2.5 bg-amber-500/20 backdrop-blur-sm ring-1 ring-amber-400/40 rounded-full px-4 py-2 text-xs text-amber-200 pointer-events-none max-w-[min(90vw,28rem)]">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="font-medium shrink-0">Location override</span>
            <span className="text-amber-300/60">·</span>
            <span className="truncate">
              Map uses {locationOverride.city}, {locationOverride.country}
              {realLocation?.ip && (
                <span className="text-amber-300/60"> — real IP {realLocation.ip}</span>
              )}
            </span>
          </div>
        )}

        {/* ── Active routing legend ──────────────────────────────────────────── */}
        {loading && activeDc && (
          <div className="absolute bottom-4 left-80 flex gap-3 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 text-xs text-white pointer-events-none">
            <span className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ background: activeDc.color }}
              />
              {isStreaming ? "Streaming from" : "Routing to"}{" "}
              <span className="font-medium">{selectedModel}</span>
              {" · "}
              <span style={{ color: activeDc.color + "dd" }}>{activeDc.provider}</span>
              {" · "}
              {activeDc.name}
              {activeDc.region && (
                <span className="text-white/40"> ({activeDc.region})</span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
