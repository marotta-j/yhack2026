/** Client-only persisted spoof for where “you” appear on the globe / routing. */

export const LOCATION_OVERRIDE_LS_KEY = "leaf-chat-location-override";

/** Response shape from GET /api/geolocate for your real connection. */
export interface ResolvedGeo {
  lat: number;
  lng: number;
  city: string;
  country: string;
  ip: string;
}

export interface StoredLocationOverride {
  lat: number;
  lng: number;
  city: string;
  country: string;
  /** Set when this position came from looking up another IP. */
  viaIp?: string;
}

export function readLocationOverride(): StoredLocationOverride | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCATION_OVERRIDE_LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as StoredLocationOverride;
    if (typeof p.lat !== "number" || typeof p.lng !== "number") return null;
    return p;
  } catch {
    return null;
  }
}

export function writeLocationOverride(o: StoredLocationOverride): void {
  localStorage.setItem(LOCATION_OVERRIDE_LS_KEY, JSON.stringify(o));
}

export function clearLocationOverrideStorage(): void {
  localStorage.removeItem(LOCATION_OVERRIDE_LS_KEY);
}
