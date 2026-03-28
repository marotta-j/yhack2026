import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Conversation from "@/models/Conversation";
import Message from "@/models/Message";
import { getLavaForwardToken, buildLavaUrl } from "@/lib/lava";

export async function POST(req: Request) {
  const { conversationId, content } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "Message content is required" }, { status: 400 });
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

  // Call OpenAI via Lava forward proxy
  const forwardToken = getLavaForwardToken();
  const lavaUrl = buildLavaUrl("https://api.openai.com/v1/chat/completions");

  const openaiRes = await fetch(lavaUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${forwardToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: conversation.aiModel ?? "gpt-4o",
      messages,
    }),
  });

  if (!openaiRes.ok) {
    const err = await openaiRes.text();
    return NextResponse.json({ error: `Lava/OpenAI error: ${err}` }, { status: 502 });
  }

  const data = await openaiRes.json();
  const assistantContent = data.choices?.[0]?.message?.content ?? "";
  const usage = data.usage ?? {};

  // Save assistant message
  const assistantMessage = await Message.create({
    conversationId: conversation._id,
    role: "assistant",
    content: assistantContent,
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  });

  // Update conversation stats
  const isFirstMessage = conversation.messageCount === 0;
  await Conversation.findByIdAndUpdate(conversation._id, {
    $inc: { messageCount: 2, totalTokens: usage.total_tokens ?? 0 },
    ...(isFirstMessage && {
      title: content.trim().slice(0, 60),
    }),
    updatedAt: new Date(),
  });

  return NextResponse.json({
    conversationId: conversation._id.toString(),
    userMessage,
    assistantMessage,
  });
}
