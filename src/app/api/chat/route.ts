import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Conversation from "@/models/Conversation";
import Message from "@/models/Message";
import { decomposePrompt } from "@/lib/decomposer";
import { resolveClosestDataCenter } from "@/lib/datacenterLocations";
import { getGridCarbonIntensity } from "@/lib/electricitymap";
import { MODEL_INTENSITY } from "@/lib/carbon";
import { Subtask, RoutedSubtask } from "@/types";

const LAVA_URL = "https://api.lava.so/v1/chat/completions";

/** Maps difficulty 1–20 to a model string (equal 4-point buckets). */
function selectModelForDifficulty(difficulty: number): string {
  if (difficulty <= 4) return "gemini-2.0-flash";
  if (difficulty <= 8) return "gpt-4o-mini";
  if (difficulty <= 12) return "grok-3-fast";
  if (difficulty <= 16) return "claude-sonnet-4-6";
  return "claude-opus-4-6";
}

/**
 * POST /api/chat — Phase 1: score → decompose → route → return JSON.
 *
 * Returns:
 *   { conversationId, userMessage, difficultyScore, decomposer_tokens, was_decomposed, subtasks }
 *
 * The client either shows a confirmation UI (was_decomposed && subtasks.length > 1)
 * or immediately POSTs to /api/chat/execute with the full subtask list.
 */
export async function POST(req: Request) {
  const {
    conversationId,
    content,
    userLat = 39.05,
    userLng = -77.46,
  } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "Message content is required" }, { status: 400 });
  }

  await connectToDatabase();
  console.log("[chat] POST received:", { conversationId, content: content?.slice(0, 80), userLat, userLng });

  // Get or create conversation
  let conversation = conversationId
    ? await Conversation.findById(conversationId)
    : null;

  if (!conversation) {
    conversation = await Conversation.create({});
    console.log("[chat] Created new conversation:", conversation._id.toString());
  } else {
    console.log("[chat] Found existing conversation:", conversation._id.toString());
  }

  // Save user message
  const userMessage = await Message.create({
    conversationId: conversation._id,
    role: "user",
    content: content.trim(),
  });
  console.log("[chat] Saved user message:", userMessage._id.toString());

  const forwardToken = process.env.LAVA_SECRET_KEY!;

  // ── Score difficulty 1–20 ──────────────────────────────────────────────────
  const difficultyRes = await fetch(LAVA_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${forwardToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5-nano",
      messages: [
        {
          role: "system",
          content: 'Rate the difficulty of answering the user message on a scale of 1-20. Return only JSON: {"score": <integer>}.',
        },
        { role: "user", content: content.trim() },
      ],
      response_format: { type: "json_object" },
    }),
  });

  let difficultyScore = 10;
  if (difficultyRes.ok) {
    const difficultyData = await difficultyRes.json();
    try {
      const parsed = JSON.parse(difficultyData.choices?.[0]?.message?.content ?? "{}");
      difficultyScore = Math.min(20, Math.max(1, parseInt(parsed.score, 10) || 10));
    } catch {}
  }
  console.log("[chat] Difficulty score:", difficultyScore);

  // ── Decompose ──────────────────────────────────────────────────────────────
  const { subtasks, decomposer_tokens, was_decomposed } = await decomposePrompt(
    content.trim(),
    difficultyScore,
  );
  console.log("[chat] Decomposition: was_decomposed=", was_decomposed, "count=", subtasks.length);

  // ── Route all subtasks ─────────────────────────────────────────────────────
  const routedSubtasks: RoutedSubtask[] = await Promise.all(
    subtasks.map(async (st: Subtask) => {
      // SEARCH subtasks go directly to a search model; all others use difficulty routing
      let model_id: string;
      if (st.type === "SEARCH") {
        model_id = st.search_type === "exa" ? "exa-search" : "serper-search";
      } else {
        model_id = selectModelForDifficulty(st.difficulty);
      }
      const dc = resolveClosestDataCenter(model_id, userLat, userLng);
      const grid_carbon_intensity = await getGridCarbonIntensity(dc.lat, dc.lng);
      const eco_score = (MODEL_INTENSITY[model_id] ?? 1.0) * grid_carbon_intensity;
      console.log(`[chat] Routed subtask: type=${st.type}${st.search_type ? `(${st.search_type})` : ""} difficulty=${st.difficulty} → model=${model_id} dc=${dc.id}`);
      return {
        ...st,
        model_id,
        lava_model_string: model_id,
        datacenter_id: dc.id,
        datacenter_lat: dc.lat,
        datacenter_lng: dc.lng,
        grid_carbon_intensity,
        eco_score,
      };
    }),
  );

  return NextResponse.json({
    conversationId: conversation._id.toString(),
    userMessage,
    difficultyScore,
    decomposer_tokens,
    was_decomposed,
    subtasks: routedSubtasks,
  });
}

