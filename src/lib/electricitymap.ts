/**
 * Returns real-time grid carbon intensity (gCO₂eq/kWh) for the given coordinates
 * or Electricity Maps zone code.
 *
 * API: GET https://api.electricitymap.org/v3/carbon-intensity/latest
 *   ?zone=<zone>          (preferred — exact zone match)
 *   ?lat=<lat>&lon=<lng>  (fallback when zone is unknown)
 *
 * Falls back to 400 gCO₂/kWh on error so downstream math always gets a number.
 * Only successful responses are cached (15-min TTL). Failures are NOT cached so
 * the next request retries the API rather than serving a stale fallback.
 */

const EM_TOKEN = process.env.ELECTRICITY_MAPS_TOKEN ?? "JXwREWHVUzbBzAv6fq9f";
const EM_BASE = "https://api.electricitymap.org/v3/carbon-intensity/latest";
const TTL_MS = 15 * 60 * 1000; // 15 minutes — only applied to real API values
const FALLBACK = 400; // gCO₂/kWh

// Module-level TTL cache — only holds real API values, never fallbacks
const cache = new Map<string, { value: number; expiresAt: number }>();

export async function getGridCarbonIntensity(
  lat: number,
  lng: number,
  zone?: string,
): Promise<number> {
  const cacheKey = zone ?? `${lat.toFixed(2)},${lng.toFixed(2)}`;

  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    console.log(`[electricitymap] cache hit: ${cacheKey} → ${hit.value} gCO₂/kWh`);
    return hit.value;
  }

  const url = zone
    ? `${EM_BASE}?zone=${encodeURIComponent(zone)}`
    : `${EM_BASE}?lat=${lat}&lon=${lng}`;

  try {
    const res = await fetch(url, {
      headers: { "auth-token": EM_TOKEN, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      // Log body for debugging — Electricity Maps returns useful error messages
      const body = await res.text().catch(() => "(unreadable)");
      console.warn(`[electricitymap] API ${res.status} for ${cacheKey} — NOT caching — fallback ${FALLBACK}\n  body: ${body}`);
      return FALLBACK;
    }

    const json = await res.json();
    const value: number = json.carbonIntensity ?? FALLBACK;
    cache.set(cacheKey, { value, expiresAt: Date.now() + TTL_MS });
    console.log(`[electricitymap] fetched: ${cacheKey} → ${value} gCO₂/kWh`);
    return value;
  } catch (err) {
    console.warn(`[electricitymap] fetch failed for ${cacheKey} — NOT caching — fallback ${FALLBACK}:`, err);
    return FALLBACK;
  }
}
