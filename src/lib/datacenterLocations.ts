export interface DataCenter {
  lat: number;
  lng: number;
  name: string;
  provider: string;
  color: string; // #rrggbb hex
}

/**
 * Maps model/provider keys to approximate data center coordinates.
 * Used to place the destination marker on the globe and label arcs.
 */
export const DATA_CENTERS: Record<string, DataCenter> = {
  'gemini-flash': {
    lat: 45.6,
    lng: -121.18,
    name: 'The Dalles, OR',
    provider: 'Google',
    color: '#34d399', // emerald
  },
  'claude-opus': {
    lat: 39.05,
    lng: -77.46,
    name: 'Ashburn, VA',
    provider: 'Anthropic',
    color: '#a78bfa', // violet
  },
  'claude-sonnet': {
    lat: 39.05,
    lng: -77.46,
    name: 'Ashburn, VA',
    provider: 'Anthropic',
    color: '#c084fc', // purple
  },
  'gpt-4o': {
    lat: 47.61,
    lng: -122.33,
    name: 'Seattle, WA',
    provider: 'Microsoft / OpenAI',
    color: '#60a5fa', // blue
  },
  'llama': {
    lat: 37.77,
    lng: -122.42,
    name: 'San Francisco, CA',
    provider: 'Meta',
    color: '#fb923c', // orange
  },
};

/** Resolve a model name (partial match ok) to a DataCenter entry. */
export function resolveDataCenter(modelName: string): DataCenter {
  const lower = modelName.toLowerCase();
  for (const [key, dc] of Object.entries(DATA_CENTERS)) {
    if (lower.includes(key)) return dc;
  }
  // Default fallback
  return DATA_CENTERS['gpt-4o'];
}
