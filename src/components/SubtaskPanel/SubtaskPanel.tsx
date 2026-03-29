"use client";

import { useState } from "react";
import { ClockIcon, LoaderIcon, CheckCircle2Icon, XCircleIcon, ChevronUpIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { subtaskColor } from "@/lib/subtaskColors";
import { RoutedSubtask } from "@/types";

export type SubtaskState = "routed_pending" | "queued" | "running" | "complete" | "error";

interface SubtaskMeta {
  type: string;
  model_id: string;
  difficulty: number;
  prompt_preview?: string;
  carbon_cost?: number;
}

interface SubtaskPanelProps {
  subtasks: RoutedSubtask[];
  subtaskStates: SubtaskState[];
  subtaskResults: (SubtaskMeta | undefined)[];
  reconstructionState: SubtaskState;
  difficultyScore: number;
  visible: boolean;
}

function formatCarbon(g: number): string {
  if (g < 0.001) return `${(g * 1e6).toFixed(1)}µg`;
  if (g < 1) return `${(g * 1000).toFixed(2)}mg`;
  if (g < 1000) return `${g.toFixed(2)}g`;
  return `${(g / 1000).toFixed(2)}kg`;
}

/** A muted orchestration step row (Difficulty Rating, Deconstruction, Reconstruction). */
function OrchestraRow({
  label,
  sublabel,
  state,
}: {
  label: string;
  sublabel?: string;
  state: SubtaskState;
}) {
  const isRunning = state === "running";
  const isComplete = state === "complete";
  const isError = state === "error";
  const ORCH_COLOR = "#94a3b8"; // slate-400 — neutral, no subtask slot color

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 transition-all duration-200",
        isRunning && "bg-white/5",
      )}
      style={{ borderLeft: `2px solid ${isComplete ? "#94a3b833" : ORCH_COLOR}` }}
    >
      {/* Status icon */}
      <div className="shrink-0 w-4 h-4 flex items-center justify-center">
        {isRunning ? (
          <LoaderIcon className="w-3.5 h-3.5 animate-spin text-slate-400" />
        ) : isComplete ? (
          <CheckCircle2Icon className="w-3.5 h-3.5 text-slate-400" />
        ) : isError ? (
          <XCircleIcon className="w-3.5 h-3.5 text-rose-400" />
        ) : (
          <ClockIcon className="w-3 h-3 text-white/20" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span className={cn("text-sm font-medium", isComplete ? "text-white/35" : "text-white/75")}>
          {label}
        </span>
        {sublabel && (
          <p className={cn("text-xs mt-0.5", isComplete ? "text-white/25" : "text-white/50")}>{sublabel}</p>
        )}
      </div>

      {/* Right */}
      <div className="shrink-0">
        {!isRunning && !isComplete && !isError && (
          <span className="text-xs text-white/20">Queued</span>
        )}
      </div>
    </div>
  );
}

export function SubtaskPanel({
  subtasks,
  subtaskStates,
  subtaskResults,
  reconstructionState,
  difficultyScore,
  visible,
}: SubtaskPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (!visible || subtasks.length <= 1) return null;

  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-white/10 bg-black/40 backdrop-blur-sm text-white w-full">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-white/60 font-semibold uppercase tracking-wider text-xs">Pipeline</span>
          <span className="text-white/30">·</span>
          <span className="text-white/40 text-xs">{subtasks.length} subtasks</span>
        </div>
        {collapsed
          ? <ChevronDownIcon className="w-3.5 h-3.5 text-white/40" />
          : <ChevronUpIcon className="w-3.5 h-3.5 text-white/40" />
        }
      </button>

      {/* Rows */}
      {!collapsed && (
        <div className="divide-y divide-white/5">
          {/* ── Orchestration: Difficulty Rating ── */}
          <OrchestraRow
            label="Difficulty Rating"
            sublabel={`Score: ${difficultyScore} / 20`}
            state="complete"
          />

          {/* ── Orchestration: Deconstruction ── */}
          <OrchestraRow
            label="Deconstruction"
            sublabel={`${subtasks.length} subtasks identified`}
            state="complete"
          />

          {/* ── Subtask rows ── */}
          {subtasks.map((st, i) => {
            const state = subtaskStates[i] ?? "routed_pending";
            const result = subtaskResults[i];
            const color = subtaskColor(i);
            const isRunning = state === "running";
            const isComplete = state === "complete";
            const isError = state === "error";
            const borderColor = isError
              ? "#f43f5e"
              : isComplete
              ? `${color}33`
              : color; // full brightness when queued or running

            return (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 transition-all duration-200",
                  isRunning && "animate-pulse bg-white/5",
                  isError && "bg-red-500/10",
                )}
                style={{ borderLeft: `2px solid ${borderColor}` }}
              >
                {/* Status icon */}
                <div className="shrink-0 w-4 h-4 flex items-center justify-center">
                  {isRunning ? (
                    <LoaderIcon className="w-3.5 h-3.5 animate-spin" style={{ color }} />
                  ) : isComplete ? (
                    <CheckCircle2Icon className="w-3.5 h-3.5 text-white/30" />
                  ) : isError ? (
                    <XCircleIcon className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <ClockIcon className="w-3.5 h-3.5" style={{ color }} />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-medium truncate", isComplete ? "text-white/35" : "text-white")}>
                      {st.model_id}
                    </span>
                    {st.datacenter_id && (
                      <span className={cn("truncate text-xs", isComplete ? "text-white/20" : "text-white/50")}>
                        {st.datacenter_id}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        isComplete
                          ? "text-white/25"
                          : st.type === "REASON"
                          ? "text-blue-300"
                          : st.type === "WRITE"
                          ? "text-green-300"
                          : "text-orange-300",
                      )}
                    >
                      {st.type}
                    </span>
                    <span className={cn("text-xs", isComplete ? "text-white/20" : "text-white/60")}>
                      Difficulty: {st.difficulty}
                    </span>
                  </div>
                </div>

                {/* Right: status badge or carbon */}
                <div className="shrink-0 text-right">
                  {isComplete && result?.carbon_cost != null ? (
                    <span className="text-xs text-white/30">{formatCarbon(result.carbon_cost)} CO₂</span>
                  ) : !isRunning && !isComplete && !isError ? (
                    <span className="text-xs" style={{ color }}>Queued</span>
                  ) : isError ? (
                    <span className="text-xs text-rose-400">Error</span>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* ── Orchestration: Reconstruction ── */}
          <OrchestraRow
            label="Reconstruction"
            sublabel="Synthesizing subtask outputs"
            state={reconstructionState}
          />
        </div>
      )}
    </div>
  );
}
