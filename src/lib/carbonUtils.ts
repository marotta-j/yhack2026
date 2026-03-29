// ─────────────────────────────────────────────────────────────────────────────
//  carbonUtils.ts
//  Helpers for displaying Electricity Maps carbon intensity data.
// ─────────────────────────────────────────────────────────────────────────────

/** gCO2eq / kWh thresholds → visual tier */
export type CarbonTier = 'very-low' | 'low' | 'moderate' | 'high' | 'very-high' | 'unknown';

interface TierDef {
  tier:    CarbonTier;
  label:   string;
  /** Hex colour used on the globe and in the UI. */
  color:   string;
  /** Upper bound (exclusive). Infinity for the last bucket. */
  maxG:    number;
}

export const CARBON_TIERS: TierDef[] = [
  { tier: 'very-low',   label: 'Very Low',   color: '#22c55e', maxG: 50    }, // green-500
  { tier: 'low',        label: 'Low',        color: '#84cc16', maxG: 150   }, // lime-400
  { tier: 'moderate',   label: 'Moderate',   color: '#eab308', maxG: 300   }, // yellow-400
  { tier: 'high',       label: 'High',       color: '#f97316', maxG: 500   }, // orange-400
  { tier: 'very-high',  label: 'Very High',  color: '#ef4444', maxG: Infinity }, // red-500
];

export const CARBON_UNKNOWN: TierDef = {
  tier: 'unknown', label: 'No data', color: '#6b7280', maxG: Infinity,
};

/**
 * Resolve a gCO2eq/kWh value (or null/undefined) to its tier definition.
 */
export function carbonTierOf(grams: number | null | undefined): TierDef {
  if (grams == null || !isFinite(grams)) return CARBON_UNKNOWN;
  return CARBON_TIERS.find((t) => grams < t.maxG) ?? CARBON_TIERS[CARBON_TIERS.length - 1];
}

/** Hex colour string for a given gCO2eq/kWh value. */
export function carbonColor(grams: number | null | undefined): string {
  return carbonTierOf(grams).color;
}

/** Short human-readable string, e.g. "217 g·CO₂/kWh" or "No data". */
export function carbonLabel(grams: number | null | undefined): string {
  if (grams == null || !isFinite(grams)) return 'No data';
  return `${Math.round(grams)} g·CO₂/kWh`;
}

/** Full tooltip string combining tier label + numeric value. */
export function carbonTooltip(grams: number | null | undefined): string {
  if (grams == null || !isFinite(grams)) return 'Carbon intensity: No data';
  const tier = carbonTierOf(grams);
  return `Carbon: ${Math.round(grams)} g·CO₂/kWh (${tier.label})`;
}

/**
 * Returns a CSS `background` gradient used in legend bars.
 * Goes left-to-right from very-low (green) to very-high (red).
 */
export const CARBON_GRADIENT =
  `linear-gradient(to right, ${CARBON_TIERS.map((t) => t.color).join(', ')})`;
