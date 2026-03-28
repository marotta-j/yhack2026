import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Conversation from "@/models/Conversation";
import Message from "@/models/Message";

export async function POST(req: Request) {
  const { conversationId, content } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json(
      { error: "Message content is required" },
      { status: 400 },
    );
  }

  await connectToDatabase();

  // Get or create conversation
  let conversation = conversationId
    ? await Conversation.findById(conversationId)
    : null;

  if (!conversation) {
    conversation = await Conversation.create({});
  }

  // Save user message
  const userMessage = await Message.create({
    conversationId: conversation._id,
    role: "user",
    content: content.trim(),
  });

  // Fetch conversation history for context
  const history = await Message.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .select("role content");

  const messages = history.map((m) => ({ role: m.role, content: m.content }));

  const forwardToken = process.env.LAVA_SECRET_KEY;
  const lavaUrl = `https://api.lava.so/v1/chat/completions`;

  // Score difficulty 1-10
  const difficultyRes = await fetch(lavaUrl, {
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
            'Rate the difficulty of answering the user message on a scale of 1-10. Return only JSON: {"score": <integer>}.',
        },
        { role: "user", content: content.trim() },
      ],
      response_format: { type: "json_object" },
    }),
  });

  let difficultyScore = 5;
  if (difficultyRes.ok) {
    const difficultyData = await difficultyRes.json();
    try {
      const parsed = JSON.parse(
        difficultyData.choices?.[0]?.message?.content ?? "{}",
      );
      difficultyScore = Math.min(
        10,
        Math.max(1, parseInt(parsed.score, 10) || 5),
      );
    } catch {
      // keep default
    }
  }

  // Select model based on difficulty score (5 tiers, eco-friendly routing)
  // Score 1-2  → Gemini 2.0 Flash   (Google)     — trivial tasks
  // Score 3-4  → GPT-4o Mini        (OpenAI)     — simple tasks
  // Score 5-6  → Grok 3 Fast        (xAI)        — moderate tasks
  // Score 7-8  → Claude Sonnet 4.6  (Anthropic)  — complex tasks
  // Score 9-10 → Claude Opus 4.6    (Anthropic)  — hardest tasks
  const selectedModel =
    difficultyScore <= 2
      ? "gemini-2.0-flash"
      : difficultyScore <= 4
        ? "gpt-4o-mini"
        : difficultyScore <= 6
          ? "grok-3-fast"
          : difficultyScore <= 8
            ? "claude-sonnet-4-6"
            : "claude-opus-4-6";

  console.log(selectedModel, "selected based on difficulty score", difficultyScore);

  const enc = new TextEncoder();
  const conversationRef = conversation;

  const stream = new ReadableStream({
    async start(controller) {
      // Immediately announce the selected model before the LLM call
      controller.enqueue(
        enc.encode(
          JSON.stringify({
            type: "model",
            model: selectedModel,
            difficultyScore,
            conversationId: conversationRef._id.toString(),
            userMessage,
          }) + "\n",
        ),
      );

      // Call LLM with streaming enabled
      const openaiRes = await fetch(lavaUrl, {
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
        controller.enqueue(
          enc.encode(
            JSON.stringify({ type: "error", error: `Lava/OpenAI error: ${err}` }) + "\n",
          ),
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
          } catch {
            // skip malformed SSE line
          }
        }
      }

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
        enc.encode(JSON.stringify({ type: "done", assistantMessage }) + "\n"),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
