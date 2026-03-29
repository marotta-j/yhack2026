import { NextRequest, NextResponse } from 'next/server';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CarbonEntry {
  /** gCO2eq / kWh */
  carbonIntensity: number;
  /** ISO 8601 timestamp of the measurement window */
  datetime: string;
  /** When the record was last updated */
  updatedAt: string;
}

export type CarbonResponse = Record<string, CarbonEntry | null>;

// ─── Server-side TTL cache ────────────────────────────────────────────────────
//  Module-level — persists across requests within the same serverless instance.

interface CacheEntry {
  value: CarbonEntry | null;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getCached(zone: string): CarbonEntry | null | undefined {
  const entry = _cache.get(zone);
  if (!entry) return undefined;          // not in cache
  if (Date.now() > entry.expiresAt) {
    _cache.delete(zone);
    return undefined;                    // expired
  }
  return entry.value;                    // null = known-bad zone
}

function setCached(zone: string, value: CarbonEntry | null) {
  _cache.set(zone, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Electricity Maps fetcher ─────────────────────────────────────────────────

const EM_TOKEN = process.env.ELECTRICITY_MAPS_TOKEN ?? 'JXwREWHVUzbBzAv6fq9f';
const EM_BASE  = 'https://api.electricitymaps.com/v3/carbon-intensity/latest';

async function fetchZone(zone: string): Promise<CarbonEntry | null> {
  const cached = getCached(zone);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(`${EM_BASE}?zone=${encodeURIComponent(zone)}`, {
      headers: { 'auth-token': EM_TOKEN },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      setCached(zone, null);
      return null;
    }

    const data = await res.json();
    if (typeof data.carbonIntensity !== 'number') {
      setCached(zone, null);
      return null;
    }

    const entry: CarbonEntry = {
      carbonIntensity: data.carbonIntensity,
      datetime:        data.datetime  ?? '',
      updatedAt:       data.updatedAt ?? '',
    };
    setCached(zone, entry);
    return entry;
  } catch {
    setCached(zone, null);
    return null;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * GET /api/carbon?zones=US-MIDA-PJM,DE,FR,...
 *
 * Returns a JSON object keyed by zone code:
 *   { "US-MIDA-PJM": { carbonIntensity: 392, datetime: "...", updatedAt: "..." } | null }
 *
 * Zones that fail or are unsupported map to null.
 * Results are cached server-side for 15 minutes.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('zones') ?? '';
  const zones = raw
    .split(',')
    .map((z) => z.trim())
    .filter(Boolean)
    .slice(0, 60); // hard cap — no runaway fan-outs

  if (zones.length === 0) {
    return NextResponse.json(
      { error: 'Provide at least one zone via ?zones=...' },
      { status: 400 },
    );
  }

  // Fetch all zones in parallel
  const results = await Promise.all(zones.map((z) => fetchZone(z)));

  const body: CarbonResponse = {};
  zones.forEach((z, i) => { body[z] = results[i]; });

  return NextResponse.json(body, {
    headers: {
      // Also let edge/CDN cache for 5 minutes
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
