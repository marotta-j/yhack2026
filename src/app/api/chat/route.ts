import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Conversation from "@/models/Conversation";
import Message from "@/models/Message";
import SubtaskDocumentModel from "@/models/SubtaskDocument";
import { decomposePrompt } from "@/lib/decomposer";
import { reconstructResponse } from "@/lib/reconstructor";
import { resolveClosestDataCenter } from "@/lib/datacenterLocations";
import { getGridCarbonIntensity } from "@/lib/electricitymap";
import {
  MODEL_INTENSITY,
  calculateSubtaskCarbon,
  calculateNaiveBaseline,
  buildCarbonReport,
} from "@/lib/carbon";
import { Subtask, RoutedSubtask, SubtaskResult } from "@/types";

const LAVA_URL = "https://api.lava.so/v1/chat/completions";

/** Maps difficulty 1–20 to a model string (same 4-point buckets as outer scorer). */
function selectModelForDifficulty(difficulty: number): string {
  if (difficulty <= 4) return "gemini-2.0-flash";
  if (difficulty <= 8) return "gpt-4o-mini";
  if (difficulty <= 12) return "grok-3-fast";
  if (difficulty <= 16) return "claude-sonnet-4-6";
  return "claude-opus-4-6";
}

/** Dispatch a single subtask to Lava (non-streaming). */
async function dispatchSubtask(
  rt: RoutedSubtask,
  forwardToken: string,
): Promise<SubtaskResult> {
  console.log(`[dispatch] Calling Lava for subtask type=${rt.type} difficulty=${rt.difficulty} model=${rt.model_id}`);

  const res = await fetch(LAVA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${forwardToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: rt.lava_model_string,
      stream: false,
      messages: [{ role: "user", content: rt.prompt }],
    }),
  });

  const data = await res.json();
  const response_text = data.choices?.[0]?.message?.content ?? "";
  const prompt_tokens = data.usage?.prompt_tokens ?? 0;
  const completion_tokens = data.usage?.completion_tokens ?? 0;
  const carbon_cost = calculateSubtaskCarbon(
    prompt_tokens + completion_tokens,
    rt.model_id,
    rt.grid_carbon_intensity,
  );

  console.log(`[dispatch] Subtask done: ${prompt_tokens}pt + ${completion_tokens}ct tokens, carbon_cost=${carbon_cost}`);

  return { ...rt, response_text, prompt_tokens, completion_tokens, carbon_cost };
}

export async function POST(req: Request) {
  const {
    conversationId,
    content,
    userLat = 39.05,
    userLng = -77.46,
  } = await req.json();

  console.log("[chat] POST received:", { conversationId, content: content?.slice(0, 80), userLat, userLng });

  if (!content?.trim()) {
    return NextResponse.json(
      { error: "Message content is required" },
      { status: 400 },
    );
  }

  await connectToDatabase();
  console.log("[chat] DB connected");

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

  // Fetch conversation history for context (used for single-subtask streaming path)
  const history = await Message.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .select("role content");

  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  console.log("[chat] Fetched history:", messages.length, "messages");

  const forwardToken = process.env.LAVA_SECRET_KEY!;

  // ── Score difficulty 1–20 ─────────────────────────────────────────────────
  console.log("[chat] Scoring difficulty...");
  const difficultyRes = await fetch(LAVA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${forwardToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5-nano",
      messages: [
        {
          role: "system",
          content:
            'Rate the difficulty of answering the user message on a scale of 1-20. Return only JSON: {"score": <integer>}.',
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
      const parsed = JSON.parse(
        difficultyData.choices?.[0]?.message?.content ?? "{}",
      );
      difficultyScore = Math.min(20, Math.max(1, parseInt(parsed.score, 10) || 10));
    } catch {
      // keep default
    }
  }
  console.log("[chat] Difficulty score:", difficultyScore);

  // ── Decompose ─────────────────────────────────────────────────────────────
  console.log("[chat] Decomposing prompt...");
  const { subtasks, decomposer_tokens, was_decomposed } = await decomposePrompt(
    content.trim(),
    difficultyScore,
  );
  console.log(
    "[chat] Decomposition result: was_decomposed=", was_decomposed,
    "subtask count=", subtasks.length,
    subtasks.map((s: Subtask) => ({ type: s.type, difficulty: s.difficulty })),
  );

  // ── Route subtasks ────────────────────────────────────────────────────────
  console.log("[chat] Routing subtasks...");
  const routedSubtasks: RoutedSubtask[] = await Promise.all(
    subtasks.map(async (st: Subtask) => {
      const model_id = selectModelForDifficulty(st.difficulty);
      const dc = resolveClosestDataCenter(model_id, userLat, userLng);
      const grid_carbon_intensity = await getGridCarbonIntensity(dc.lat, dc.lng);
      const eco_score = (MODEL_INTENSITY[model_id] ?? 1.0) * grid_carbon_intensity;
      console.log(
        `[chat] Routed subtask: type=${st.type} difficulty=${st.difficulty} → model=${model_id} dc=${dc.id} eco_score=${eco_score}`,
      );
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

  // The primary model for the "model" event (first subtask's model)
  const selectedModel = routedSubtasks[0].model_id;

  const enc = new TextEncoder();
  const conversationRef = conversation;

  const stream = new ReadableStream({
    async start(controller) {
      console.log("[chat/stream] Starting stream...");

      // Emit model event
      controller.enqueue(
        enc.encode(
          JSON.stringify({
            type: "model",
            model: selectedModel,
            difficultyScore,
            conversationId: conversationRef._id.toString(),
            userMessage,
            was_decomposed,
            subtask_count: routedSubtasks.length,
          }) + "\n",
        ),
      );
      console.log("[chat/stream] Emitted 'model' event: model=", selectedModel, "was_decomposed=", was_decomposed);

      let allResults: SubtaskResult[] = [];

      if (!was_decomposed) {
        // ── Single subtask: use existing SSE streaming path ────────────────
        console.log("[chat/stream] Single subtask — using streaming path, model:", selectedModel);

        const openaiRes = await fetch(LAVA_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${forwardToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: selectedModel,
            messages,
            stream: true,
          }),
        });

        if (!openaiRes.ok) {
          const err = await openaiRes.text();
          console.error("[chat/stream] Lava error:", err);
          controller.enqueue(
            enc.encode(JSON.stringify({ type: "error", error: `Lava error: ${err}` }) + "\n"),
          );
          controller.close();
          return;
        }

        console.log("[chat/stream] Lava response OK, streaming deltas...");
        const reader = openaiRes.body!.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";
        let fullContent = "";
        let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        let deltaCount = 0;

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
                deltaCount++;
                controller.enqueue(
                  enc.encode(JSON.stringify({ type: "delta", content: delta }) + "\n"),
                );
              }
            } catch {
              // skip malformed SSE line
            }
          }
        }

        console.log("[chat/stream] Streaming complete:", deltaCount, "deltas,", usage.total_tokens, "total tokens");

        // Build a SubtaskResult for carbon reporting
        const rt = routedSubtasks[0];
        const carbon_cost = calculateSubtaskCarbon(
          usage.total_tokens,
          rt.model_id,
          rt.grid_carbon_intensity,
        );
        allResults = [{
          ...rt,
          response_text: fullContent,
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          carbon_cost,
        }];

        // Emit subtask_result event
        controller.enqueue(
          enc.encode(
            JSON.stringify({
              type: "subtask_result",
              subtask: { type: rt.type, model_id: rt.model_id, difficulty: rt.difficulty },
            }) + "\n",
          ),
        );

        // Save assistant message
        console.log("[chat/stream] Saving assistant message...");
        const assistantMessage = await Message.create({
          conversationId: conversationRef._id,
          role: "assistant",
          content: fullContent,
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        });
        console.log("[chat/stream] Saved assistant message:", assistantMessage._id.toString());

        // Save subtask document
        await SubtaskDocumentModel.create({
          messageId: assistantMessage._id,
          conversationId: conversationRef._id,
          ...allResults[0],
        });
        console.log("[chat/stream] Saved SubtaskDocument for single subtask");

        // Carbon report
        const totalTokens = usage.total_tokens + decomposer_tokens.prompt_tokens + decomposer_tokens.completion_tokens;
        const naiveBaseline = await calculateNaiveBaseline(totalTokens, userLat, userLng);
        const orchDc = resolveClosestDataCenter("gemini-2.0-flash", userLat, userLng);
        const orchGridCarbon = await getGridCarbonIntensity(orchDc.lat, orchDc.lng);
        const orchestrationTokens = decomposer_tokens.prompt_tokens + decomposer_tokens.completion_tokens;
        const carbonReport = buildCarbonReport(
          allResults,
          orchestrationTokens,
          "gemini-2.0-flash",
          orchGridCarbon,
          naiveBaseline,
          userLat,
          userLng,
        );

        const isFirstMessage = conversationRef.messageCount === 0;
        await Conversation.findByIdAndUpdate(conversationRef._id, {
          $inc: { messageCount: 2, totalTokens: usage.total_tokens ?? 0 },
          aiModel: selectedModel,
          ...(isFirstMessage && { title: content.trim().slice(0, 60) }),
          updatedAt: new Date(),
        });
        console.log("[chat/stream] Updated conversation metadata");

        controller.enqueue(
          enc.encode(
            JSON.stringify({ type: "done", assistantMessage, carbon_report: carbonReport, was_decomposed, subtask_count: 1 }) + "\n",
          ),
        );
        console.log("[chat/stream] Emitted 'done' event, closing stream");
        controller.close();

      } else {
        // ── Multi-subtask: dispatch groups in SEARCH → REASON → WRITE order ──
        console.log("[chat/stream] Multi-subtask path — dispatching in type order");

        const typeOrder: Array<"SEARCH" | "REASON" | "WRITE"> = ["SEARCH", "REASON", "WRITE"];
        for (const groupType of typeOrder) {
          const batch = routedSubtasks.filter((rt) => rt.type === groupType);
          if (batch.length === 0) continue;

          console.log(`[chat/stream] Dispatching ${batch.length} ${groupType} subtask(s) in parallel...`);
          const batchResults = await Promise.all(
            batch.map((rt) => dispatchSubtask(rt, forwardToken)),
          );
          allResults.push(...batchResults);

          for (const result of batchResults) {
            controller.enqueue(
              enc.encode(
                JSON.stringify({
                  type: "subtask_result",
                  subtask: {
                    type: result.type,
                    model_id: result.model_id,
                    difficulty: result.difficulty,
                    prompt_preview: result.prompt.slice(0, 80),
                  },
                }) + "\n",
              ),
            );
            console.log(`[chat/stream] Emitted subtask_result for ${result.type} (${result.model_id})`);
          }
        }

        // Reconstruct
        console.log("[chat/stream] Reconstructing", allResults.length, "subtask results...");
        const { response: finalResponse, reconstructor_tokens } =
          await reconstructResponse(allResults, content.trim());
        console.log("[chat/stream] Reconstruction done, response length:", finalResponse.length);

        // Stream reconstructed response as chunked delta events
        console.log("[chat/stream] Streaming reconstructed response as deltas...");
        const CHUNK = 50;
        let deltaCount = 0;
        for (let i = 0; i < finalResponse.length; i += CHUNK) {
          controller.enqueue(
            enc.encode(
              JSON.stringify({ type: "delta", content: finalResponse.slice(i, i + CHUNK) }) + "\n",
            ),
          );
          deltaCount++;
        }
        console.log("[chat/stream] Streamed", deltaCount, "delta chunks");

        // Save assistant message
        const totalSubtaskTokens = allResults.reduce(
          (s, r) => s + r.prompt_tokens + r.completion_tokens,
          0,
        );
        const totalOrchTokens =
          decomposer_tokens.prompt_tokens +
          decomposer_tokens.completion_tokens +
          reconstructor_tokens.prompt_tokens +
          reconstructor_tokens.completion_tokens;

        console.log("[chat/stream] Saving assistant message...");
        const assistantMessage = await Message.create({
          conversationId: conversationRef._id,
          role: "assistant",
          content: finalResponse,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: totalSubtaskTokens + totalOrchTokens,
        });
        console.log("[chat/stream] Saved assistant message:", assistantMessage._id.toString());

        // Save SubtaskDocuments
        await SubtaskDocumentModel.insertMany(
          allResults.map((r) => ({
            messageId: assistantMessage._id,
            conversationId: conversationRef._id,
            prompt: r.prompt,
            type: r.type,
            difficulty: r.difficulty,
            model_id: r.model_id,
            datacenter_id: r.datacenter_id,
            datacenter_lat: r.datacenter_lat,
            datacenter_lng: r.datacenter_lng,
            grid_carbon_intensity: r.grid_carbon_intensity,
            eco_score: r.eco_score,
            response_text: r.response_text,
            prompt_tokens: r.prompt_tokens,
            completion_tokens: r.completion_tokens,
            carbon_cost: r.carbon_cost,
          })),
        );
        console.log("[chat/stream] Saved", allResults.length, "SubtaskDocument(s)");

        // Carbon report
        const orchDc = resolveClosestDataCenter("gemini-2.0-flash", userLat, userLng);
        const orchGridCarbon = await getGridCarbonIntensity(orchDc.lat, orchDc.lng);
        const naiveBaseline = await calculateNaiveBaseline(
          totalSubtaskTokens + totalOrchTokens,
          userLat,
          userLng,
        );
        const carbonReport = buildCarbonReport(
          allResults,
          totalOrchTokens,
          "gemini-2.0-flash",
          orchGridCarbon,
          naiveBaseline,
          userLat,
          userLng,
        );

        const isFirstMessage = conversationRef.messageCount === 0;
        await Conversation.findByIdAndUpdate(conversationRef._id, {
          $inc: { messageCount: 2, totalTokens: totalSubtaskTokens + totalOrchTokens },
          aiModel: selectedModel,
          ...(isFirstMessage && { title: content.trim().slice(0, 60) }),
          updatedAt: new Date(),
        });
        console.log("[chat/stream] Updated conversation metadata");

        controller.enqueue(
          enc.encode(
            JSON.stringify({
              type: "done",
              assistantMessage,
              carbon_report: carbonReport,
              was_decomposed,
              subtask_count: allResults.length,
            }) + "\n",
          ),
        );
        console.log("[chat/stream] Emitted 'done' event, closing stream");
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
