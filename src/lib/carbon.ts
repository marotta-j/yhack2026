import { SubtaskResult, CarbonReport } from "@/types";
import { resolveClosestDataCenter } from "@/lib/datacenterLocations";
import { getGridCarbonIntensity } from "@/lib/electricitymap";
import { FLOPS_PER_TOKEN, MODELS } from "@/config/models";

/**
 * H100 system-level energy efficiency constant.
 * Derived from full-node power draw (GPU + CPU + memory + networking + PUE),
 * not just GPU die: ~0.39 J/token for 70B models at batch-128.
 * Units: kWh per FLOP.
 */
export const KWH_PER_FLOP_H100 = 3.96e-15;

/**
 * Carbon cost for a single LLM (or search) call, using physics-grounded FLOPs accounting.
 *
 * Formula: tokens × (flops_per_token × 1e9) × KWH_PER_FLOP_H100 × gridCarbonIntensity
 * Units: result is in gCO₂ (grid intensity is gCO₂/kWh, energy is kWh).
 */
export function calculateSubtaskCarbon(
  tokens: number,
  modelId: string,
  gridCarbonIntensity: number,
): number {
  const flops = FLOPS_PER_TOKEN[modelId] ?? 14; // default to lightest known model
  const energyKwh = tokens * flops * 1e9 * KWH_PER_FLOP_H100;
  const cost = energyKwh * gridCarbonIntensity;
  console.log(
    `[carbon] calculateSubtaskCarbon: ${tokens} tokens × ${flops} GFLOPs × 1e9 × ${KWH_PER_FLOP_H100} kWh/FLOP × ${gridCarbonIntensity} gCO₂/kWh = ${cost.toExponential(3)} gCO₂`,
  );
  return cost;
}

/**
 * What would it cost if the user had sent their message directly to the
 * baseline flagship model (marked isBaseline in models config)?
 *
 * Token count = inputTokens (user message, measured by difficulty scorer) +
 *               outputTokens (final response completion tokens) +
 *               difficultyTokens (scorer overhead — included because it runs
 *               even in the naive scenario).
 * Subtask execution, decomposition, and reconstruction tokens are NOT included.
 */
export async function calculateNaiveBaseline(
  inputTokens: number,
  outputTokens: number,
  difficultyTokens: number,
  userLat: number,
  userLng: number,
): Promise<number> {
  const baselineModel = MODELS.find((m) => m.isBaseline)
    ?? MODELS.reduce((a, b) => (a.flops_per_token >= b.flops_per_token ? a : b));
  const dc = resolveClosestDataCenter(baselineModel.model_id, userLat, userLng);
  console.log(
    `[carbon] Naive baseline model: ${baselineModel.model_id} (${baselineModel.flops_per_token} GFLOPs), DC: ${dc.id}`,
  );
  const gridCarbon = await getGridCarbonIntensity(dc.lat, dc.lng, dc.zone);
  const totalTokens = inputTokens + outputTokens + difficultyTokens;
  const baseline = calculateSubtaskCarbon(totalTokens, baselineModel.model_id, gridCarbon);
  console.log(`[carbon] Naive baseline tokens: ${inputTokens} input + ${outputTokens} output + ${difficultyTokens} difficulty = ${totalTokens}, cost: ${baseline.toExponential(3)} gCO₂`);
  return baseline;
}

/**
 * Assemble the final CarbonReport from all subtask results + orchestration overhead.
 */
export function buildCarbonReport(
  results: SubtaskResult[],
  orchestrationTokens: number,
  orchestrationModelId: string,
  orchestrationGridCarbon: number,
  naiveBaseline: number,
  userLat: number,
  userLng: number,
): CarbonReport {
  const subtaskCarbon = results.reduce((sum, r) => sum + r.carbon_cost, 0);
  const orchestration_overhead = calculateSubtaskCarbon(
    orchestrationTokens,
    orchestrationModelId,
    orchestrationGridCarbon,
  );
  const total_carbon = subtaskCarbon + orchestration_overhead;
  const delta = naiveBaseline - total_carbon;

  console.log("[carbon] buildCarbonReport:", {
    subtaskCarbon: subtaskCarbon.toFixed(0),
    orchestration_overhead: orchestration_overhead.toFixed(0),
    total_carbon: total_carbon.toFixed(0),
    naive_baseline: naiveBaseline.toFixed(0),
    delta: delta.toFixed(0),
    savings_pct: naiveBaseline > 0 ? ((delta / naiveBaseline) * 100).toFixed(1) + "%" : "n/a",
  });

  return {
    subtasks: results,
    orchestration_overhead,
    total_carbon,
    naive_baseline: naiveBaseline,
    delta,
    user_location: { lat: userLat, lng: userLng },
  };
}
