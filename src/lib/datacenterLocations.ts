export interface DataCenter {
  lat: number;
  lng: number;
  name: string;
  provider: string;
  color: string; // #rrggbb hex
}

/**
 * Maps model/provider keys to approximate data center coordinates.
 * Keys are matched as substrings of the lowercase model name, so
 * "gemini-2.0-flash" matches the "gemini" key, "grok-3-fast" matches
 * "grok", etc.
 */
export const DATA_CENTERS: Record<string, DataCenter> = {
  // Google — The Dalles, OR data center
  'gemini': {
    lat: 45.6,
    lng: -121.18,
    name: 'The Dalles, OR',
    provider: 'Google',
    color: '#34d399', // emerald
  },
  // OpenAI / Microsoft — Seattle, WA (Azure West US)
  'gpt': {
    lat: 47.61,
    lng: -122.33,
    name: 'Seattle, WA',
    provider: 'OpenAI',
    color: '#60a5fa', // blue
  },
  // xAI — Memphis, TN (Colossus supercomputer)
  'grok': {
    lat: 35.15,
    lng: -90.05,
    name: 'Memphis, TN',
    provider: 'xAI',
    color: '#f87171', // coral/red
  },
  // Anthropic (Sonnet) — Ashburn, VA (AWS us-east-1)
  'claude-sonnet': {
    lat: 39.05,
    lng: -77.46,
    name: 'Ashburn, VA',
    provider: 'Anthropic',
    color: '#c084fc', // purple
  },
  // Anthropic (Opus) — Ashburn, VA (AWS us-east-1)
  'claude-opus': {
    lat: 39.05,
    lng: -77.46,
    name: 'Ashburn, VA',
    provider: 'Anthropic',
    color: '#a78bfa', // violet
  },
  // Anthropic (Haiku) — Ashburn, VA
  'claude-haiku': {
    lat: 39.05,
    lng: -77.46,
    name: 'Ashburn, VA',
    provider: 'Anthropic',
    color: '#e879f9', // fuchsia
  },
};

/**
 * Resolve a Lava model name to a DataCenter entry.
 * Iterates keys from most-specific to least-specific so "claude-sonnet"
 * matches before the broader "claude" would (if it existed).
 */
export function resolveDataCenter(modelName: string): DataCenter {
  const lower = modelName.toLowerCase();

  // Check longer/more-specific keys first to avoid "gpt" swallowing "gpt-4o-mini"
  // before a more specific key could match. Sort by key length descending.
  const sortedKeys = Object.keys(DATA_CENTERS).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    if (lower.includes(key)) return DATA_CENTERS[key];
  }

  // Default fallback — OpenAI/Seattle
  return DATA_CENTERS['gpt'];
}
