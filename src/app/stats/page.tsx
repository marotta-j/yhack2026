"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, LeafIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────

interface StatsData {
  totalMessages: number;
  totalTokens: number;
  totalCarbonCost: number;
  totalCarbonSaved: number;
  totalNaiveBaseline: number;
  savingsPct: number;
  byModel: { _id: string; count: number }[];
  byType: { _id: string; count: number }[];
  daily: { date: string; saved: number; used: number }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCarbon(g: number): string {
  if (g < 0.001) return `${(g * 1e6).toFixed(1)} µg CO₂`;
  if (g < 1) return `${(g * 1000).toFixed(2)} mg CO₂`;
  if (g < 1000) return `${g.toFixed(2)} g CO₂`;
  return `${(g / 1000).toFixed(2)} kg CO₂`;
}

function formatModelId(id: string): string {
  const names: Record<string, string> = {
    "gemini-2.0-flash": "Gemini Flash",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gpt-5-nano": "GPT-5 Nano",
    "gpt-4o-mini": "GPT-4o Mini",
    "gpt-5-mini": "GPT-5 Mini",
    "gpt-5": "GPT-5",
    "claude-haiku-4-5": "Claude Haiku",
    "claude-sonnet-4-6": "Claude Sonnet",
    "claude-opus-4-6": "Claude Opus",
    "grok-3-fast": "Grok 3 Fast",
    "grok-3": "Grok 3",
    "deepseek-v3": "DeepSeek V3",
    "deepseek-r1": "DeepSeek R1",
    "o4-mini": "o4 Mini",
    "serper-search": "Google Search",
    "exa-search": "Exa Search",
  };
  return names[id] ?? id;
}

const MODEL_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const TYPE_COLORS: Record<string, string> = {
  WRITE: "var(--color-chart-1)",
  REASON: "var(--color-chart-2)",
  SEARCH: "var(--color-chart-3)",
};

// ── Chart configs ──────────────────────────────────────────────────────────────

const dailyChartConfig: ChartConfig = {
  saved: { label: "CO₂ Saved", color: "var(--color-chart-1)" },
  used:  { label: "CO₂ Used",  color: "var(--color-chart-2)" },
};

const typeChartConfig: ChartConfig = {
  count: { label: "Subtasks" },
};

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const modelChartConfig: ChartConfig = Object.fromEntries(
    (data?.byModel ?? []).map((m, i) => [
      m._id,
      { label: formatModelId(m._id), color: MODEL_COLORS[i % MODEL_COLORS.length] },
    ]),
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Link href="/chat">
          <Button variant="ghost" size="icon">
            <ArrowLeftIcon className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <LeafIcon className="w-5 h-5 text-emerald-500" />
          <h1 className="font-semibold text-lg">Statistics</h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : !data ? (
          <p className="text-muted-foreground text-sm">Failed to load stats.</p>
        ) : (
          <>
            {/* ── Headline numbers ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Total Queries"
                value={data.totalMessages.toLocaleString()}
                sub="assistant responses"
              />
              <StatCard
                title="Total Tokens"
                value={data.totalTokens.toLocaleString()}
              />
              <StatCard
                title="Carbon Used"
                value={formatCarbon(data.totalCarbonCost)}
                sub="across all queries"
              />
              <StatCard
                title="Carbon Saved"
                value={formatCarbon(data.totalCarbonSaved)}
                sub={data.savingsPct > 0 ? `${data.savingsPct}% vs flagship model` : undefined}
              />
            </div>

            {/* ── Daily carbon trend ───────────────────────────────────────── */}
            {data.daily.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">CO₂ Saved per Day (last 30 days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={dailyChartConfig} className="h-48 w-full">
                    <AreaChart data={data.daily} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => v.slice(5)} // MM-DD
                      />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}g`} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        type="monotone"
                        dataKey="saved"
                        stroke="var(--color-chart-1)"
                        fill="var(--color-chart-1)"
                        fillOpacity={0.2}
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="used"
                        stroke="var(--color-chart-2)"
                        fill="var(--color-chart-2)"
                        fillOpacity={0.1}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* ── By model + by type ────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Queries by model */}
              {data.byModel.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Subtasks by Model</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={modelChartConfig} className="h-52 w-full">
                      <BarChart
                        data={data.byModel.map((m) => ({ name: formatModelId(m._id), count: m.count, id: m._id }))}
                        layout="vertical"
                        margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {data.byModel.map((m, i) => (
                            <Cell key={m._id} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              )}

              {/* Subtasks by type */}
              {data.byType.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Subtasks by Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={typeChartConfig} className="h-52 w-full">
                      <BarChart
                        data={data.byType.map((t) => ({ name: t._id, count: t.count }))}
                        margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {data.byType.map((t) => (
                            <Cell key={t._id} fill={TYPE_COLORS[t._id] ?? "var(--color-chart-4)"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
