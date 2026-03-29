import { SubtaskResult, CarbonReport } from "@/types";
import { resolveClosestDataCenter } from "@/lib/datacenterLocations";
import { getGridCarbonIntensity } from "@/lib/electricitymap";

/** Relative energy-per-token on a unitless scale (gemini-2.0-flash = 1.0 baseline). */
export const MODEL_INTENSITY: Record<string, number> = {
  "gemini-2.0-flash": 1.0,
  "gpt-4o-mini": 1.5,
  "grok-3-fast": 2.0,
  "claude-sonnet-4-6": 3.0,
  "claude-opus-4-6": 8.0,
};

/**
 * Carbon cost for a single LLM call.
 * Units: tokens × intensity × gCO₂/kWh — treated as a relative score, not real grams.
 */
export function calculateSubtaskCarbon(
  tokens: number,
  modelId: string,
  gridCarbonIntensity: number,
): number {
  const intensity = MODEL_INTENSITY[modelId] ?? 1.0;
  const cost = tokens * intensity * gridCarbonIntensity;
  console.log(
    `[carbon] calculateSubtaskCarbon: ${tokens} tokens × ${intensity} intensity × ${gridCarbonIntensity} gCO₂/kWh = ${cost}`,
  );
  return cost;
}

/**
 * What would it cost to send the same total tokens to Claude Opus 4.6
 * (the heaviest model) at the nearest Opus datacenter?
 * Used as the "naive" baseline for savings calculation.
 */
export async function calculateNaiveBaseline(
  totalTokens: number,
  userLat: number,
  userLng: number,
): Promise<number> {
  const heavyModel = "claude-opus-4-6";
  const dc = resolveClosestDataCenter(heavyModel, userLat, userLng);
  console.log(
    `[carbon] Naive baseline DC for ${heavyModel}: ${dc.id} (${dc.name})`,
  );
  const gridCarbon = await getGridCarbonIntensity(dc.lat, dc.lng);
  const baseline = totalTokens * (MODEL_INTENSITY[heavyModel] ?? 8.0) * gridCarbon;
  console.log(
    `[carbon] Naive baseline: ${totalTokens} tokens × ${MODEL_INTENSITY[heavyModel]} × ${gridCarbon} = ${baseline}`,
  );
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
    subtaskCarbon,
    orchestration_overhead,
    total_carbon,
    naive_baseline: naiveBaseline,
    delta,
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
