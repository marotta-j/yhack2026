import { SubtaskResult } from "@/types";

const LAVA_URL = "https://api.lava.so/v1/chat/completions";

const SYNTHESIZER_SYSTEM_PROMPT = `You are an expert AI assistant answering a user's question. To prepare your answer, a research pipeline ran several sub-processes and gathered relevant information and analysis. You will be given the original user question and the sub-process outputs.

Your job is to synthesize a single, complete, high-quality response that directly answers the user's question — as if you had done all the work yourself.

RULES:
- Answer the user's question directly. Structure your response around what the user asked, not around how the sub-processes were organized.
- The user must never be able to tell that their request was split into parts. Do not mention subtasks, sub-agents, or any internal process.
- Incorporate all relevant information from the sub-process outputs. Do not drop facts, data, code, or analysis.
- If the outputs contain conflicting information, use your judgment to reconcile or note the discrepancy naturally.
- If the outputs contain code, preserve it exactly with proper formatting.
- Respond in the same tone and level of detail the user's question calls for.`;

export async function reconstructResponse(
  subtaskResults: SubtaskResult[],
  originalPrompt: string,
): Promise<{
  response: string;
  reconstructor_tokens: { prompt_tokens: number; completion_tokens: number };
}> {
  // Single non-SEARCH subtask — return as-is (already a well-formed LLM response)
  // SEARCH results must always go through synthesis: raw serper/exa output is not user-facing text
  if (subtaskResults.length === 1 && subtaskResults[0].type !== "SEARCH") {
    console.log("[reconstructor] Single non-SEARCH subtask, skipping synthesis");
    return {
      response: subtaskResults[0].response_text,
      reconstructor_tokens: { prompt_tokens: 0, completion_tokens: 0 },
    };
  }

  console.log("[reconstructor] Synthesizing", subtaskResults.length, "subtask results for prompt:", originalPrompt.slice(0, 80));

  const userMsg =
    `The user asked:\n"${originalPrompt}"\n\n` +
    `Here are the outputs from the research pipeline:\n\n` +
    subtaskResults
      .map((r, i) => `[Output ${i + 1}]\n${r.response_text}`)
      .join("\n\n");

  const forwardToken = process.env.LAVA_SECRET_KEY;

  const res = await fetch(LAVA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${forwardToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gemini-2.0-flash",
      stream: false,
      messages: [
        { role: "system", content: SYNTHESIZER_SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
    }),
  });

  const data = await res.json();
  const response = data.choices?.[0]?.message?.content ?? "";
  const reconstructor_tokens = {
    prompt_tokens: data.usage?.prompt_tokens ?? 0,
    completion_tokens: data.usage?.completion_tokens ?? 0,
  };

  console.log("[reconstructor] Synthesis done:", reconstructor_tokens, "tokens used, response length:", response.length);
  return { response, reconstructor_tokens };
}
