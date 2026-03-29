import { Subtask } from "@/types";

const LAVA_URL = "https://api.lava.so/v1/chat/completions";

const DECOMPOSER_SYSTEM_PROMPT = `You are a task decomposer for an LLM orchestration system. Your job is to decide whether a prompt needs to be broken into subtasks, and if so, produce the minimal set of subtasks needed.

RULES:
- NEVER return more than 4 subtasks.
- Only decompose when the prompt genuinely contains multiple independent pieces of work.
- Each subtask prompt must be COMPLETELY SELF-CONTAINED. A different AI agent will execute each subtask with NO knowledge of the original prompt or other subtasks. Include all necessary context in each subtask prompt.
- Each subtask must produce a specific, concrete output.

TASK TYPES:
- REASON: The subtask requires analysis, evaluation, comparison, logical reasoning, or decision-making. The output is a conclusion, assessment, or recommendation.
- WRITE: The subtask requires producing language output — prose, code, email, documentation, creative writing, etc. The output is text or code.
- SEARCH: The subtask requires finding current or external information. The output is factual data. You MUST also include a "search_type" field for every SEARCH subtask:
  - "google": Use for simple, fast lookups — current prices, news headlines, recent events, stock tickers, weather, sports scores, release dates. The query should be concise (under 20 words).
  - "exa": Use for deep research — finding specific documents, academic papers, technical blog posts, comprehensive topic research, multi-faceted queries that need ranked web results.

For each subtask, provide:
- prompt: The exact self-contained prompt to send to a sub-agent.
- type: "REASON", "WRITE", or "SEARCH"
- difficulty: A difficulty score from 1–20 using the same scale as the original scoring:
  1–4: Trivial. Simple rewording, basic facts, short answers, casual conversation.
  5–8: Easy. Straightforward writing, simple explanations, basic code snippets.
  9–12: Moderate. Multi-paragraph writing, analysis, moderate code, comparing concepts.
  13–16: Hard. Deep reasoning, complex code, research synthesis, multi-step problems.
  17–20: Very hard. Novel algorithms, expert-level analysis, large code systems, cutting-edge topics.
- search_type: (SEARCH subtasks only) "google" or "exa" — see above.

Return ONLY a JSON object with a single key "subtasks" containing the array. Examples:
{"subtasks": [{"prompt": "...", "type": "WRITE", "difficulty": 5}]}
{"subtasks": [{"prompt": "What is the current price of TSLA stock?", "type": "SEARCH", "difficulty": 2, "search_type": "google"}]}
{"subtasks": [{"prompt": "Find recent research papers on transformer attention mechanisms published in 2024", "type": "SEARCH", "difficulty": 8, "search_type": "exa"}]}`;

export async function decomposePrompt(
  prompt: string,
  originalScore: number,
): Promise<{
  subtasks: Subtask[];
  decomposer_tokens: { prompt_tokens: number; completion_tokens: number };
  was_decomposed: boolean;
}> {
  // Score gate: skip decomposition for simple prompts
  if (originalScore <= 1) {
    return {
      subtasks: [{ prompt, type: "WRITE", difficulty: originalScore }],
      decomposer_tokens: { prompt_tokens: 0, completion_tokens: 0 },
      was_decomposed: false,
    };
  }

  const forwardToken = process.env.LAVA_SECRET_KEY;

  let raw = "";
  let decomposer_tokens = { prompt_tokens: 0, completion_tokens: 0 };

  try {
    const res = await fetch(LAVA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${forwardToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.0-flash",
        stream: false,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: DECOMPOSER_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await res.json();
    raw = data.choices?.[0]?.message?.content ?? "";
    decomposer_tokens = {
      prompt_tokens: data.usage?.prompt_tokens ?? 0,
      completion_tokens: data.usage?.completion_tokens ?? 0,
    };
  } catch (err) {
    console.warn("[decomposer] Lava call failed:", err);
    return {
      subtasks: [{ prompt, type: "WRITE", difficulty: originalScore }],
      decomposer_tokens,
      was_decomposed: false,
    };
  }

  // Strip markdown fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);

    // structured output returns { subtasks: [...] }
    if (!parsed.subtasks || !Array.isArray(parsed.subtasks)) {
      throw new Error("Response missing 'subtasks' array");
    }
    const items = parsed.subtasks;

    if (items.length < 1 || items.length > 4) {
      throw new Error(`Array length ${items.length} out of range 1–4`);
    }

    const subtasks: Subtask[] = [];
    for (const item of items) {
      if (typeof item.prompt !== "string" || !item.prompt.trim()) {
        throw new Error("Subtask prompt is empty or not a string");
      }
      if (!["REASON", "WRITE", "SEARCH"].includes(item.type)) {
        throw new Error(`Invalid subtask type: ${item.type}`);
      }
      const d = parseInt(item.difficulty, 10);
      if (isNaN(d) || d < 1 || d > 20) {
        throw new Error(`Invalid difficulty: ${item.difficulty}`);
      }
      // Validate search_type for SEARCH subtasks; default to "google" if missing
      let search_type: "google" | "exa" | undefined;
      if (item.type === "SEARCH") {
        if (item.search_type === "exa") {
          search_type = "exa";
        } else {
          search_type = "google"; // default; covers missing or invalid values
          if (item.search_type && item.search_type !== "google") {
            console.warn(`[decomposer] Unknown search_type "${item.search_type}", defaulting to "google"`);
          }
        }
      }
      subtasks.push({ prompt: item.prompt.trim(), type: item.type, difficulty: d, ...(search_type && { search_type }) });
    }

    // Sum of difficulties must not exceed originalScore × 1.2
    const diffSum = subtasks.reduce((s, t) => s + t.difficulty, 0);
    const cap = originalScore * 1.2;
    // if (diffSum > cap) {
    //   throw new Error(`Difficulty sum ${diffSum} exceeds cap ${cap}`);
    // }

    return { subtasks, decomposer_tokens, was_decomposed: true };
  } catch (err) {
    console.warn("[decomposer] Validation failed, falling back to single subtask:", err);
    console.warn(cleaned)
    return {
      subtasks: [{ prompt, type: "WRITE", difficulty: originalScore }],
      decomposer_tokens,
      was_decomposed: false,
    };
  }
}
