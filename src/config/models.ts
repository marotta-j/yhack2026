// ─────────────────────────────────────────────────────────────────────────────
//  src/config/models.ts
//  Single source of truth for all model metadata.
//  Adding a new model: add one entry here. Nothing else to change.
//
//  flops_per_token: estimated GFLOPs consumed per output token during decode.
//    Base FLOPs = 2 × N_active_parameters (OpenAI scaling laws approximation).
//    For MoE models, N_active = activated params per token (not total params).
//    For reasoning models (o3, R1), value is effective FLOPs per *visible* output
//    token, accounting for hidden chain-of-thought tokens: base × cot_multiplier.
//    For search models, value is a nominal estimate (cost is dominated by the
//    external API call, not inference compute).
//
//  Carbon equation (used in carbon.ts):
//    gCO₂/token = (flops_per_token × 1e9) × KWH_PER_FLOP_H100 × gCO₂_per_kWh
// ─────────────────────────────────────────────────────────────────────────────

export interface ModelConfig {
  /** Internal key used throughout the codebase. */
  model_id: string;
  /** Human-readable label for UI display. */
  display_name: string;
  /** Exact string the Lava API (or search dispatcher) expects. */
  lava_model_string: string;
  /** Inclusive lower bound of the 1–20 difficulty range this model handles. */
  difficulty_min: number;
  /** Inclusive upper bound of the 1–20 difficulty range this model handles. */
  difficulty_max: number;
  /**
   * Estimated GFLOPs (1e9 FLOPs) consumed per output token.
   * Derived from 2 × N_active_params for dense/MoE base models;
   * multiplied by CoT token ratio for reasoning models.
   * For search models, a nominal estimate proportional to API cost.
   */
  flops_per_token: number;
  /**
   * Cloud providers that operate this model.
   * Used by resolveClosestDataCenter to filter candidate datacenters.
   * Empty array for search models → falls back to geographically closest DC.
   */
  fulfillment_companies: string[];
  /**
   * When true, this model is used as the naive carbon baseline.
   * Exactly one model should have this flag set.
   */
  isBaseline?: boolean;
}

export const MODELS: ModelConfig[] = [
  // ── Search models (type === "SEARCH", never selected by difficulty routing) ─
  {
    model_id: "serper-search",
    display_name: "Serper Search",
    lava_model_string: "serper-search",
    difficulty_min: 0,
    difficulty_max: 0,  // unreachable by difficulty routing
    flops_per_token: 4, // nominal; compute is negligible vs API latency
    fulfillment_companies: [],
  },
  {
    model_id: "exa-search",
    display_name: "Exa Search",
    lava_model_string: "exa-search",
    difficulty_min: 0,
    difficulty_max: 0,  // unreachable by difficulty routing
    flops_per_token: 7, // nominal; slightly heavier neural retrieval
    fulfillment_companies: [],
  },

  // ── Light / simple tasks (difficulty 1–5) ──────────────────────────────────
  {
    model_id: "gemini-2.0-flash",
    display_name: "Gemini 2.0 Flash",
    lava_model_string: "gemini-2.0-flash",
    difficulty_min: 1,
    difficulty_max: 3,
    flops_per_token: 14,        // MoE ~7B active, 2×7 = 14 GFLOPs
    fulfillment_companies: ["Google Cloud"],
  },
  {
    model_id: "gpt-5-nano",
    display_name: "GPT-5 Nano",
    lava_model_string: "gpt-5-nano",
    difficulty_min: 1,
    difficulty_max: 4,
    flops_per_token: 16,        // MoE ~8B active, 2×8 = 16 GFLOPs
    fulfillment_companies: ["Azure", "Oracle", "SoftBank", "Nvidia"],
  },
  {
    model_id: "gemini-2.5-flash",
    display_name: "Gemini 2.5 Flash",
    lava_model_string: "gemini-2.5-flash",
    difficulty_min: 1,
    difficulty_max: 5,
    flops_per_token: 20,        // MoE ~10B active, 2×10 = 20 GFLOPs
    fulfillment_companies: ["Google Cloud"],
  },

  // ── Mid-range tasks (difficulty 2–9) ───────────────────────────────────────
  {
    model_id: "gpt-4o-mini",
    display_name: "GPT-4o Mini",
    lava_model_string: "gpt-4o-mini",
    difficulty_min: 2,
    difficulty_max: 6,
    flops_per_token: 30,        // MoE ~15B active, 2×15 = 30 GFLOPs
    fulfillment_companies: ["Azure", "Oracle", "SoftBank", "Nvidia"],
  },
  {
    model_id: "deepseek-chat",
    display_name: "DeepSeek V3.2 Chat",
    lava_model_string: "deepseek-chat",
    difficulty_min: 2,
    difficulty_max: 7,
    flops_per_token: 74,        // MoE 671B total, 37B active (top-8/256), 2×37 = 74 GFLOPs
    fulfillment_companies: ["Google Cloud"],
  },
  {
    model_id: "claude-haiku-4-5",
    display_name: "Claude Haiku 4.5",
    lava_model_string: "claude-haiku-4-5",
    difficulty_min: 3,
    difficulty_max: 8,
    flops_per_token: 40,        // dense ~20B params, 2×20 = 40 GFLOPs
    fulfillment_companies: ["AWS", "Google Cloud"],
  },
  {
    model_id: "gpt-5-mini",
    display_name: "GPT-5 Mini",
    lava_model_string: "gpt-5-mini",
    difficulty_min: 3,
    difficulty_max: 8,
    flops_per_token: 60,        // MoE ~30B active, 2×30 = 60 GFLOPs (light reasoning)
    fulfillment_companies: ["Azure", "Oracle", "SoftBank", "Nvidia"],
  },
  {
    model_id: "grok-3-fast",
    display_name: "Grok 3 Fast",
    lava_model_string: "grok-3-fast",
    difficulty_min: 4,
    difficulty_max: 9,
    flops_per_token: 86,        // MoE ~43B active, 2×43 = 86 GFLOPs
    fulfillment_companies: ["xAI"],
  },

  // ── Capable / complex tasks (difficulty 4–15) ─────────────────────────────
  {
    model_id: "gemini-2.5-pro",
    display_name: "Gemini 2.5 Pro",
    lava_model_string: "gemini-2.5-pro",
    difficulty_min: 4,
    difficulty_max: 10,
    flops_per_token: 100,       // MoE ~50B active, 2×50 = 100 GFLOPs
    fulfillment_companies: ["Google Cloud"],
  },
  {
    model_id: "deepseek-reasoner",
    display_name: "DeepSeek R1",
    lava_model_string: "deepseek-reasoner",
    difficulty_min: 5,
    difficulty_max: 12,
    flops_per_token: 370,       // 74 GFLOPs base × ~5× hidden CoT tokens = 370
    fulfillment_companies: ["Google Cloud"],
  },
  {
    model_id: "claude-sonnet-4-6",
    display_name: "Claude Sonnet 4.6",
    lava_model_string: "claude-sonnet-4-6",
    difficulty_min: 6,
    difficulty_max: 14,
    flops_per_token: 140,       // dense ~70B params, 2×70 = 140 GFLOPs
    fulfillment_companies: ["AWS", "Google Cloud"],
  },
  {
    model_id: "grok-3",
    display_name: "Grok 3",
    lava_model_string: "grok-3",
    difficulty_min: 7,
    difficulty_max: 14,
    flops_per_token: 260,       // MoE ~130B active, 2×130 = 260 GFLOPs
    fulfillment_companies: ["xAI"],
  },
  {
    model_id: "gpt-5",
    display_name: "GPT-5",
    lava_model_string: "gpt-5",
    difficulty_min: 7,
    difficulty_max: 15,
    flops_per_token: 200,       // MoE ~100B active, 2×100 = 200 GFLOPs
    fulfillment_companies: ["Azure", "Oracle", "SoftBank", "Nvidia"],
  },
  {
    model_id: "o4-mini",
    display_name: "OpenAI o4 Mini",
    lava_model_string: "o4-mini",
    difficulty_min: 8,
    difficulty_max: 16,
    flops_per_token: 300,       // MoE ~30B active × ~5× CoT = 60×5 = 300 GFLOPs
    fulfillment_companies: ["Azure", "Oracle", "SoftBank", "Nvidia"],
  },

  // ── Frontier / hardest tasks (difficulty 10–20) ───────────────────────────
  {
    model_id: "claude-opus-4-6",
    display_name: "Claude Opus 4.6",
    lava_model_string: "claude-opus-4-6",
    difficulty_min: 10,
    difficulty_max: 20,
    flops_per_token: 500,       // dense ~250B params, 2×250 = 500 GFLOPs
    fulfillment_companies: ["AWS", "Google Cloud"],
    isBaseline: true,
  },
];

// this debug line was too long
//console.log("[models] Loaded", MODELS.length, "models:", MODELS.map((m) => m.model_id));

/**
 * Returns the cheapest (lowest flops_per_token) model whose difficulty range
 * covers the given score. When multiple models can handle a difficulty,
 * picking the greenest one is the core EcoPrompt value proposition.
 *
 * Falls back to the highest-flops model if no range matches.
 * Never returns search models (difficulty_max: 0 keeps them out of range).
 */
export function selectModelForDifficulty(difficulty: number): ModelConfig {
  const candidates = MODELS.filter(
    (m) => difficulty >= m.difficulty_min && difficulty <= m.difficulty_max,
  );

  const match =
    candidates.length > 0
      ? candidates.reduce((a, b) => (a.flops_per_token <= b.flops_per_token ? a : b))
      : MODELS.reduce((a, b) => (a.flops_per_token >= b.flops_per_token ? a : b));

  console.log(
    `[models] selectModelForDifficulty(${difficulty}) → ${match.model_id} ` +
    `(${match.flops_per_token} GFLOPs, range ${match.difficulty_min}–${match.difficulty_max}, ` +
    `from ${candidates.length} candidate(s))`,
  );
  return match;
}

/** Lookup map from model_id → flops_per_token. Used by carbon.ts and route.ts. */
export const FLOPS_PER_TOKEN: Record<string, number> = Object.fromEntries(
  MODELS.map((m) => [m.model_id, m.flops_per_token]),
);
