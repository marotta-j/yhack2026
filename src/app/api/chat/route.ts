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

      const reader = openaiRes.body!.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let fullContent = "";
      let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop()!;

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.usage) usage = parsed.usage;
            const delta = parsed.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              fullContent += delta;
              controller.enqueue(
                enc.encode(JSON.stringify({ type: "delta", content: delta }) + "\n"),
              );
            }
          } catch {
            // skip malformed SSE line
          }
        }
      }

      // Back-fill token count onto the user message now that we have usage data
      await Message.findByIdAndUpdate(userMessage._id, {
        promptTokens: usage.prompt_tokens ?? 0,
        totalTokens: usage.prompt_tokens ?? 0,
      });

      // Save assistant message
      const assistantMessage = await Message.create({
        conversationId: conversationRef._id,
        role: "assistant",
        content: fullContent,
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
      });

      const isFirstMessage = conversationRef.messageCount === 0;
      await Conversation.findByIdAndUpdate(conversationRef._id, {
        $inc: { messageCount: 2, totalTokens: usage.total_tokens ?? 0 },
        ...(isFirstMessage && { title: content.trim().slice(0, 60) }),
        updatedAt: new Date(),
      });

      controller.enqueue(
        enc.encode(
          JSON.stringify({
            type: "done",
            assistantMessage,
            userMessageId: userMessage._id.toString(),
            userMessageTokens: usage.prompt_tokens ?? 0,
          }) + "\n",
        ),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
