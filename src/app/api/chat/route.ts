import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Conversation from "@/models/Conversation";
import Message from "@/models/Message";
import { decomposePrompt } from "@/lib/decomposer";
import { resolveClosestDataCenter } from "@/lib/datacenterLocations";
import { getGridCarbonIntensity } from "@/lib/electricitymap";
import { selectModelForDifficulty } from "@/config/models";
import { Subtask, RoutedSubtask } from "@/types";

const LAVA_URL = "https://api.lava.so/v1/chat/completions";

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
      const model = selectModelForDifficulty(st.difficulty);
      const dc = resolveClosestDataCenter(model.model_id, userLat, userLng);
      const grid_carbon_intensity = await getGridCarbonIntensity(dc.lat, dc.lng);
      // eco_score = gCO₂ per token at this datacenter (single-token carbon cost)
      const eco_score = model.flops_per_token * 1e9 * 3.96e-15 * grid_carbon_intensity;
      console.log(`[chat] Routed subtask: type=${st.type} difficulty=${st.difficulty} → model=${model.model_id} dc=${dc.id}`);
      return {
        ...st,
        model_id: model.model_id,
        lava_model_string: model.lava_model_string,
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
