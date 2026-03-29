import { connectToDatabase } from "@/lib/mongodb";
import Conversation from "@/models/Conversation";
import Message from "@/models/Message";
import SubtaskDocumentModel from "@/models/SubtaskDocument";
import { reconstructResponse } from "@/lib/reconstructor";
import { resolveClosestDataCenter } from "@/lib/datacenterLocations";
import { getGridCarbonIntensity } from "@/lib/electricitymap";
import {
  calculateSubtaskCarbon,
  calculateNaiveBaseline,
  buildCarbonReport,
} from "@/lib/carbon";
import { RoutedSubtask, SubtaskResult } from "@/types";

const LAVA_URL = "https://api.lava.so/v1/chat/completions";

/** Dispatch a single LLM subtask to Lava (non-streaming). */
async function dispatchSubtask(rt: RoutedSubtask, forwardToken: string): Promise<SubtaskResult> {
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

  console.log(`[dispatch] ${rt.model_id} done: ${prompt_tokens}pt + ${completion_tokens}ct, carbon=${carbon_cost}`);
  return { ...rt, response_text, prompt_tokens, completion_tokens, carbon_cost };
}

// ── Search helpers ────────────────────────────────────────────────────────────

const LAVA_FORWARD = "https://api.lava.so/v1/forward";

interface SerperResult {
  position?: number;
  title?: string;
  link?: string;
  snippet?: string;
}

interface ExaResult {
  title?: string;
  url?: string;
  publishedDate?: string;
  text?: string;
}

function formatSerperResults(data: Record<string, unknown>): string {
  const parts: string[] = [];

  const ab = data.answerBox as Record<string, string> | undefined;
  if (ab?.answer) {
    parts.push(`Answer: ${ab.answer}`);
  } else if (ab?.snippet) {
    parts.push(`Answer: ${ab.snippet}`);
  }

  const organic = (data.organic as SerperResult[] | undefined) ?? [];
  if (organic.length) {
    parts.push("\nSearch results:");
    for (const r of organic.slice(0, 6)) {
      parts.push(`[${r.position}] ${r.title ?? ""}${r.snippet ? ` — ${r.snippet}` : ""}${r.link ? `\n    ${r.link}` : ""}`);
    }
  }

  return parts.join("\n") || "No results found.";
}

function formatExaResults(data: Record<string, unknown>): string {
  const results = (data.results as ExaResult[] | undefined) ?? [];
  if (!results.length) return "No results found.";

  return results.map((r) => {
    const date = r.publishedDate ? ` (${r.publishedDate.slice(0, 10)})` : "";
    const text = r.text ? `\n  ${r.text.slice(0, 400)}` : "";
    return `${r.title || "Untitled"}${date}\n  ${r.url ?? ""}${text}`;
  }).join("\n\n");
}

/**
 * Dispatch a SEARCH subtask via Lava's forward proxy.
 *   search_type "google" → https://google.serper.dev/search  (fast factual lookups)
 *   search_type "exa"    → https://api.exa.ai/search         (deep research / ranked web)
 */
async function dispatchSearch(rt: RoutedSubtask, forwardToken: string): Promise<SubtaskResult> {
  const isExa = rt.search_type === "exa";
  const targetUrl = isExa
    ? "https://api.exa.ai/search"
    : "https://google.serper.dev/search";
  const forwardUrl = `${LAVA_FORWARD}?u=${encodeURIComponent(targetUrl)}`;
  const searchModel = isExa ? "exa-search" : "serper-search";

  console.log(`[dispatch] SEARCH (${searchModel}) → ${targetUrl}`);
  console.log(`[dispatch] Query: "${rt.prompt.slice(0, 100)}"`);

  const body = isExa
    ? {
        query: rt.prompt,
        numResults: 5,
        useAutoprompt: true,
        type: "neural",
        contents: { text: { maxCharacters: 500 } },
      }
    : { q: rt.prompt, num: 8, gl: "us", hl: "en" };

  const res = await fetch(forwardUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${forwardToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[dispatch] ${searchModel} HTTP ${res.status}:`, errText.slice(0, 300));
    throw new Error(`${searchModel} returned ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as Record<string, unknown>;
  console.log(`[dispatch] ${searchModel} response keys:`, Object.keys(data));

  const response_text = isExa ? formatExaResults(data) : formatSerperResults(data);
  console.log(`[dispatch] ${searchModel} done, formatted length: ${response_text.length} chars`);

  // Search API calls have no LLM token cost
  const carbon_cost = calculateSubtaskCarbon(0, searchModel, rt.grid_carbon_intensity);

  return {
    ...rt,
    model_id: searchModel,
    lava_model_string: searchModel,
    response_text,
    prompt_tokens: 0,
    completion_tokens: 0,
    carbon_cost,
  };
}

/**
 * POST /api/chat/execute — Phase 2: dispatch selected subtasks → stream response.
 *
 * Accepts pre-routed subtasks from the client (post-confirmation).
 * - was_decomposed=false → SSE streaming with conversation history (single subtask)
 * - was_decomposed=true  → parallel dispatch in SEARCH→REASON→WRITE order, chunked deltas
 */
export async function POST(req: Request) {
  const {
    selectedSubtasks,
    originalMessage,
    conversationId,
    userLat = 39.05,
    userLng = -77.46,
    decomposer_tokens,
    was_decomposed,
  }: {
    selectedSubtasks: RoutedSubtask[];
    originalMessage: string;
    conversationId: string;
    userLat: number;
    userLng: number;
    decomposer_tokens: { prompt_tokens: number; completion_tokens: number };
    was_decomposed: boolean;
  } = await req.json();

  await connectToDatabase();
  console.log("[execute] POST: was_decomposed=", was_decomposed, "subtasks=", selectedSubtasks.length);

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
  }

  const forwardToken = process.env.LAVA_SECRET_KEY!;
  const selectedModel = selectedSubtasks[0].model_id;
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      console.log("[execute/stream] Starting, model=", selectedModel);

      controller.enqueue(
        enc.encode(
          JSON.stringify({
            type: "model",
            model: selectedModel,
            was_decomposed,
            subtask_count: selectedSubtasks.length,
          }) + "\n",
        ),
      );

      let allResults: SubtaskResult[] = [];

      if (!was_decomposed) {
        // ── Single subtask: real-time SSE streaming with conversation history ──
        console.log("[execute/stream] Single subtask path — streaming with history");

        const history = await Message.find({ conversationId })
          .sort({ createdAt: 1 })
          .select("role content");
        const messages = history.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        }));

        const rt = selectedSubtasks[0];

        const openaiRes = await fetch(LAVA_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${forwardToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: rt.lava_model_string, messages, stream: true }),
        });

        if (!openaiRes.ok) {
          const err = await openaiRes.text();
          console.error("[execute/stream] Lava error:", err);
          controller.enqueue(
            enc.encode(JSON.stringify({ type: "error", error: `Lava error: ${err}` }) + "\n"),
          );
          controller.close();
          return;
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
            } catch {}
          }
        }

        console.log("[execute/stream] Streaming done:", usage.total_tokens, "tokens");

        const carbon_cost = calculateSubtaskCarbon(usage.total_tokens, rt.model_id, rt.grid_carbon_intensity);
        allResults = [{
          ...rt,
          response_text: fullContent,
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          carbon_cost,
        }];

        controller.enqueue(
          enc.encode(JSON.stringify({
            type: "subtask_result",
            subtask: { type: rt.type, model_id: rt.model_id, difficulty: rt.difficulty },
          }) + "\n"),
        );

        const assistantMessage = await Message.create({
          conversationId,
          role: "assistant",
          content: fullContent,
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        });

        await SubtaskDocumentModel.create({
          messageId: assistantMessage._id,
          conversationId,
          ...allResults[0],
        });

        const totalTokens =
          usage.total_tokens +
          decomposer_tokens.prompt_tokens +
          decomposer_tokens.completion_tokens;
        const naiveBaseline = await calculateNaiveBaseline(totalTokens, userLat, userLng);
        const orchDc = resolveClosestDataCenter("gemini-2.0-flash", userLat, userLng);
        const orchGridCarbon = await getGridCarbonIntensity(orchDc.lat, orchDc.lng, orchDc.zone);
        const carbonReport = buildCarbonReport(
          allResults,
          decomposer_tokens.prompt_tokens + decomposer_tokens.completion_tokens,
          "gemini-2.0-flash",
          orchGridCarbon,
          naiveBaseline,
          userLat,
          userLng,
        );

        const isFirstMessage = conversation.messageCount === 0;
        await Conversation.findByIdAndUpdate(conversationId, {
          $inc: { messageCount: 2, totalTokens: usage.total_tokens ?? 0 },
          aiModel: selectedModel,
          ...(isFirstMessage && { title: originalMessage.slice(0, 60) }),
          updatedAt: new Date(),
        });

        controller.enqueue(
          enc.encode(JSON.stringify({
            type: "done",
            assistantMessage,
            carbon_report: carbonReport,
            was_decomposed,
            subtask_count: 1,
          }) + "\n"),
        );
        console.log("[execute/stream] Emitted done (single path)");
        controller.close();

      } else {
        // ── Multi-subtask: dispatch in SEARCH → REASON → WRITE order ──────────
        console.log("[execute/stream] Multi-subtask path —", selectedSubtasks.length, "subtasks");

        const typeOrder: Array<"SEARCH" | "REASON" | "WRITE"> = ["SEARCH", "REASON", "WRITE"];
        for (const groupType of typeOrder) {
          const batch = selectedSubtasks.filter((rt) => rt.type === groupType);
          if (batch.length === 0) continue;

          console.log(`[execute/stream] Dispatching ${batch.length} ${groupType} subtask(s)...`);
          const batchResults = await Promise.all(
            batch.map((rt) =>
              rt.type === "SEARCH"
                ? dispatchSearch(rt, forwardToken)
                : dispatchSubtask(rt, forwardToken),
            ),
          );
          allResults.push(...batchResults);

          for (const result of batchResults) {
            controller.enqueue(
              enc.encode(JSON.stringify({
                type: "subtask_result",
                subtask: {
                  type: result.type,
                  model_id: result.model_id,
                  difficulty: result.difficulty,
                  prompt_preview: result.prompt.slice(0, 80),
                },
              }) + "\n"),
            );
          }
        }

        console.log("[execute/stream] Reconstructing", allResults.length, "results...");
        const { response: finalResponse, reconstructor_tokens } =
          await reconstructResponse(allResults, originalMessage);

        const CHUNK = 50;
        for (let i = 0; i < finalResponse.length; i += CHUNK) {
          controller.enqueue(
            enc.encode(JSON.stringify({ type: "delta", content: finalResponse.slice(i, i + CHUNK) }) + "\n"),
          );
        }

        const totalSubtaskTokens = allResults.reduce(
          (s, r) => s + r.prompt_tokens + r.completion_tokens,
          0,
        );
        const totalOrchTokens =
          decomposer_tokens.prompt_tokens +
          decomposer_tokens.completion_tokens +
          reconstructor_tokens.prompt_tokens +
          reconstructor_tokens.completion_tokens;

        const assistantMessage = await Message.create({
          conversationId,
          role: "assistant",
          content: finalResponse,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: totalSubtaskTokens + totalOrchTokens,
        });

        await SubtaskDocumentModel.insertMany(
          allResults.map((r) => ({
            messageId: assistantMessage._id,
            conversationId,
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

        const orchDc = resolveClosestDataCenter("gemini-2.0-flash", userLat, userLng);
        const orchGridCarbon = await getGridCarbonIntensity(orchDc.lat, orchDc.lng, orchDc.zone);
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

        const isFirstMessage = conversation.messageCount === 0;
        await Conversation.findByIdAndUpdate(conversationId, {
          $inc: { messageCount: 2, totalTokens: totalSubtaskTokens + totalOrchTokens },
          aiModel: selectedModel,
          ...(isFirstMessage && { title: originalMessage.slice(0, 60) }),
          updatedAt: new Date(),
        });

        controller.enqueue(
          enc.encode(JSON.stringify({
            type: "done",
            assistantMessage,
            carbon_report: carbonReport,
            was_decomposed,
            subtask_count: allResults.length,
          }) + "\n"),
        );
        console.log("[execute/stream] Emitted done (multi path)");
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
