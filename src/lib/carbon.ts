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
 * Carbon cost for a single LLM call, using physics-grounded FLOPs accounting.
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
 * What would it cost to send the same total tokens to the heaviest available
 * model (highest flops_per_token) at its nearest datacenter?
 * Used as the "naive" baseline for savings calculation.
 */
export async function calculateNaiveBaseline(
  totalTokens: number,
  userLat: number,
  userLng: number,
): Promise<number> {
  const heavyModel = MODELS.reduce((a, b) =>
    a.flops_per_token >= b.flops_per_token ? a : b,
  );
  const dc = resolveClosestDataCenter(heavyModel.model_id, userLat, userLng);
  console.log(
    `[carbon] Naive baseline model: ${heavyModel.model_id} (${heavyModel.flops_per_token} GFLOPs), DC: ${dc.id}`,
  );
  const gridCarbon = await getGridCarbonIntensity(dc.lat, dc.lng);
  const baseline = calculateSubtaskCarbon(totalTokens, heavyModel.model_id, gridCarbon);
  console.log(`[carbon] Naive baseline total: ${baseline.toExponential(3)} gCO₂`);
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
    subtaskCarbon: subtaskCarbon.toExponential(3),
    orchestration_overhead: orchestration_overhead.toExponential(3),
    total_carbon: total_carbon.toExponential(3),
    naive_baseline: naiveBaseline.toExponential(3),
    delta: delta.toExponential(3),
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
