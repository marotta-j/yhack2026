import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Conversation from "@/models/Conversation";
import Message from "@/models/Message";
import { decomposePrompt } from "@/lib/decomposer";
import { resolveClosestDataCenter } from "@/lib/datacenterLocations";
import { getGridCarbonIntensity } from "@/lib/electricitymap";
import { selectModelForDifficulty, FLOPS_PER_TOKEN } from "@/config/models";
import { KWH_PER_FLOP_H100, calculateSubtaskCarbon } from "@/lib/carbon";
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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const userId = session.user.id;

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

  // Get or create conversation (verify ownership if existing)
  let conversation = conversationId
    ? await Conversation.findOne({ _id: conversationId, userId })
    : null;

  if (!conversation) {
    conversation = await Conversation.create({ userId });
    console.log("[chat] Created new conversation:", conversation._id.toString());
  } else {
    console.log("[chat] Found existing conversation:", conversation._id.toString());
  }

  // Save user message
  const userMessage = await Message.create({
    conversationId: conversation._id,
    userId,
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
  let difficultyPromptTokens = 0;
  let difficultyPromptCarbon = 0;
  if (difficultyRes.ok) {
    const difficultyData = await difficultyRes.json();
    try {
      const parsed = JSON.parse(difficultyData.choices?.[0]?.message?.content ?? "{}");
      difficultyScore = Math.min(20, Math.max(1, parseInt(parsed.score, 10) || 10));
    } catch {}
    // Capture prompt tokens sent to the difficulty scorer and compute their carbon cost
    difficultyPromptTokens = difficultyData.usage?.prompt_tokens ?? 0;
    if (difficultyPromptTokens > 0) {
      const scorerDc = resolveClosestDataCenter("gpt-5-nano", userLat, userLng);
      const scorerGridCarbon = await getGridCarbonIntensity(scorerDc.lat, scorerDc.lng, scorerDc.zone);
      difficultyPromptCarbon = calculateSubtaskCarbon(difficultyPromptTokens, "gpt-5-nano", scorerGridCarbon);
      console.log(`[chat] Scorer tokens: ${difficultyPromptTokens}, carbon: ${difficultyPromptCarbon.toExponential(3)} gCO₂`);
    }
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
      let lava_model_string: string;
      if (st.type === "SEARCH") {
        model_id = st.search_type === "exa" ? "exa-search" : "serper-search";
        lava_model_string = model_id;
      } else {
        const model = selectModelForDifficulty(st.difficulty);
        model_id = model.model_id;
        lava_model_string = model.lava_model_string;
      }
      const dc = resolveClosestDataCenter(model_id, userLat, userLng);
      const grid_carbon_intensity = await getGridCarbonIntensity(dc.lat, dc.lng, dc.zone);
      // eco_score = gCO₂ per token at this datacenter
      const eco_score = (FLOPS_PER_TOKEN[model_id] ?? 14) * 1e9 * KWH_PER_FLOP_H100 * grid_carbon_intensity;
      console.log(`[chat] Routed subtask: type=${st.type}${st.search_type ? `(${st.search_type})` : ""} difficulty=${st.difficulty} → model=${model_id} dc=${dc.id}`);
      return {
        ...st,
        model_id,
        lava_model_string,
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
    difficulty_prompt_tokens: difficultyPromptTokens,
    difficulty_prompt_carbon: difficultyPromptCarbon,
  });
}

