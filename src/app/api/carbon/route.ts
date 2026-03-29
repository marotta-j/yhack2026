// ─────────────────────────────────────────────────────────────────────────────
//  /api/carbon
//  Server-side proxy for the Electricity Maps carbon-intensity API.
//  Returns a batch result keyed by zone code.
//  Responses are cached for 15 minutes to stay well within the free-tier
//  rate-limit of the Electricity Maps API.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';

const EM_TOKEN =
  process.env.ELECTRICITY_MAPS_TOKEN ?? 'JXwREWHVUzbBzAv6fq9f';

const EM_BASE = 'https://api.electricitymap.org/v3/carbon-intensity/latest';

const TTL_MS = 15 * 60 * 1000; // 15 minutes

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZoneCarbonData {
  carbonIntensity: number;
  datetime: string;
  updatedAt: string;
}

export type CarbonResponse = Record<string, ZoneCarbonData | null>;

// ─── Module-level TTL cache ───────────────────────────────────────────────────

interface CacheEntry {
  data: ZoneCarbonData | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

async function fetchZone(zone: string): Promise<ZoneCarbonData | null> {
  const now = Date.now();
  const hit = cache.get(zone);
  if (hit && hit.expiresAt > now) return hit.data;

  try {
    const res = await fetch(`${EM_BASE}?zone=${encodeURIComponent(zone)}`, {
      headers: {
        'auth-token': EM_TOKEN,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      cache.set(zone, { data: null, expiresAt: now + TTL_MS });
      return null;
    }

    const json = await res.json();
    const data: ZoneCarbonData = {
      carbonIntensity: json.carbonIntensity ?? 0,
      datetime: json.datetime ?? new Date().toISOString(),
      updatedAt: json.updatedAt ?? new Date().toISOString(),
    };
    cache.set(zone, { data, expiresAt: now + TTL_MS });
    return data;
  } catch {
    cache.set(zone, { data: null, expiresAt: now + TTL_MS });
    return null;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * GET /api/carbon?zones=US-MIDA-PJM,DE,FR
 *
 * Returns a JSON object mapping each zone code to its latest carbon intensity
 * data, or `null` if the zone is unavailable.
 */
export async function GET(req: NextRequest): Promise<NextResponse<CarbonResponse>> {
  const zonesParam = req.nextUrl.searchParams.get('zones') ?? '';
  const zones = zonesParam
    .split(',')
    .map((z) => z.trim())
    .filter(Boolean);

  if (zones.length === 0) {
    return NextResponse.json({});
  }

  // Fetch all zones in parallel
  const results = await Promise.all(zones.map((z) => fetchZone(z)));

  const response: CarbonResponse = {};
  for (let i = 0; i < zones.length; i++) {
    response[zones[i]] = results[i];
  }

  return NextResponse.json(response, {
    headers: {
      // Tell the browser it can cache this for 5 minutes too
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  });
}
