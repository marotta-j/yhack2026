"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ResolvedGeo, StoredLocationOverride } from "@/lib/locationOverrideStorage";
import {
  ChevronUpIcon,
  ChevronDownIcon,
  SearchIcon,
  XCircleIcon,
  MapPinIcon,
  LoaderIcon,
  NavigationIcon,
} from "lucide-react";

interface LocationOverridePanelProps {
  realLocation: ResolvedGeo | null;
  override: StoredLocationOverride | null;
  onApplyOverride: (loc: StoredLocationOverride) => void;
  onClearOverride: () => void;
}

function looksLikeIp(s: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return true;
  if (s.includes(":")) return true;
  return false;
}

export function LocationOverridePanel({
  realLocation,
  override,
  onApplyOverride,
  onClearOverride,
}: LocationOverridePanelProps) {
  const [open, setOpen] = useState(false);
  const [ipInput, setIpInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMock = override !== null;

  async function handleLookup() {
    const val = ipInput.trim();
    if (!val) return;
    if (!looksLikeIp(val)) {
      setError("Enter a valid IPv4 or IPv6 (e.g. 8.8.8.8)");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/geolocate?ip=${encodeURIComponent(val)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const loc: StoredLocationOverride = {
        lat: data.lat,
        lng: data.lng,
        city: data.city ?? "Unknown",
        country: data.country ?? "Unknown",
        viaIp: data.ip ?? val,
      };
      onApplyOverride(loc);
      setIpInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  function handleClearInput() {
    setIpInput("");
    setError(null);
  }

  return (
    <div className="absolute bottom-4 left-4 z-10 w-72">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center justify-between gap-2 backdrop-blur-sm rounded-xl px-3 py-2 text-white transition-colors",
          isMock
            ? "bg-amber-500/30 hover:bg-amber-500/40 ring-1 ring-amber-400/50"
            : "bg-black/70 hover:bg-black/80",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <NavigationIcon
            className={cn("w-3.5 h-3.5 shrink-0", isMock ? "text-amber-400" : "text-white/60")}
          />
          <span className="text-xs font-semibold tracking-wide truncate">
            Location override
          </span>
          {isMock && (
            <span className="text-[10px] text-amber-300 font-medium shrink-0">ACTIVE</span>
          )}
        </div>
        {open ? (
          <ChevronDownIcon className="w-3.5 h-3.5 text-white/50 shrink-0" />
        ) : (
          <ChevronUpIcon className="w-3.5 h-3.5 text-white/50 shrink-0" />
        )}
      </button>

      {open && (
        <div className="mt-1 bg-black/75 backdrop-blur-sm rounded-xl overflow-hidden">
          <div className="px-3 pt-3 pb-2">
            <label className="text-[10px] text-white/40 uppercase tracking-widest block mb-1.5">
              Use another IP&apos;s region as yours
            </label>
            <p className="text-[10px] text-white/35 leading-relaxed mb-2">
              Your real IP is unchanged — only this app treats your position as if it were that
              address (globe pin and closest-DC routing).
            </p>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={ipInput}
                  onChange={(e) => {
                    setIpInput(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                  placeholder="e.g. 8.8.8.8"
                  className={cn(
                    "w-full bg-white/8 border rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/25",
                    "focus:outline-none focus:ring-1",
                    error
                      ? "border-red-500/50 focus:ring-red-500/50"
                      : "border-white/10 focus:ring-white/25",
                  )}
                />
                {ipInput && (
                  <button
                    type="button"
                    onClick={handleClearInput}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                  >
                    <XCircleIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={handleLookup}
                disabled={loading || !ipInput.trim()}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white"
              >
                {loading ? (
                  <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <SearchIcon className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            {error && <p className="mt-1.5 text-[10px] text-red-400">{error}</p>}
          </div>

          {isMock && override && (
            <div className="mx-3 mb-2 flex items-center gap-2 bg-amber-500/10 rounded-lg px-2.5 py-2 ring-1 ring-amber-400/25">
              <MapPinIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium truncate">
                  Acting as {override.city}, {override.country}
                </p>
                <p className="text-[10px] text-white/40 tabular-nums">
                  {override.lat.toFixed(2)}, {override.lng.toFixed(2)}
                  {override.viaIp && (
                    <span className="text-white/30"> · ref IP {override.viaIp}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {realLocation && (
            <div className="mx-3 mb-2 flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-2">
              <MapPinIcon className="w-3.5 h-3.5 text-white/35 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-white/45 uppercase tracking-wide">Your real IP</p>
                <p className="text-xs text-white/70 font-mono truncate">{realLocation.ip}</p>
                <p className="text-[10px] text-white/35 truncate">
                  {realLocation.city}, {realLocation.country}
                </p>
              </div>
            </div>
          )}

          {isMock && (
            <div className="px-3 pb-3">
              <button
                type="button"
                onClick={onClearOverride}
                className="w-full py-2 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/18 text-white transition-colors"
              >
                Use my real location on the map
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
