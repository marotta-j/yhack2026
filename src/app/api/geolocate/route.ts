import { NextRequest, NextResponse } from 'next/server';

export interface GeolocateResponse {
  lat: number;
  lng: number;
  city: string;
  country: string;
  ip: string;
}

export async function GET(req: NextRequest): Promise<NextResponse<GeolocateResponse>> {
  // Resolve client IP — works behind Vercel / nginx proxies
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null;

  // Skip geolocation for loopback addresses (local dev)
  const isLocal =
    !ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.');

  if (!isLocal && ip) {
    try {
      const res = await fetch(`https://ipinfo.io/${ip}/json`, {
        headers: { Accept: 'application/json' },
        // Short timeout so we never block the UI
        signal: AbortSignal.timeout(3000),
      });
      const data = await res.json();

      if (data.loc) {
        const [lat, lng] = data.loc.split(',').map(Number);
        return NextResponse.json({
          lat,
          lng,
          city: data.city ?? 'Unknown',
          country: data.country ?? 'Unknown',
          ip: data.ip ?? ip,
        });
      }
    } catch {
      // Fall through to default
    }
  }

  // Default: New York City (good neutral fallback for demos)
  return NextResponse.json({
    lat: 40.71,
    lng: -74.01,
    city: 'New York',
    country: 'US',
    ip: ip ?? '127.0.0.1',
  });
}
