'use client';

import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

// ─── Public types ─────────────────────────────────────────────────────────────

/** An animated arc drawn between two lat/lng points. */
export interface ArcData {
  /** Unique identifier — used as React key and for removal. */
  id: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  /** CSS hex color, e.g. "#4ade80". */
  color: string;
  /** Arc peak height relative to globe radius (0–1). Default 0.1. */
  altitude?: number;
  /** Line stroke width in px. Default 1.5. */
  strokeWidth?: number;
  /** Duration of one animation loop in ms. Default 1400. */
  animateTime?: number;
  /**
   * When true the arc renders as a solid persistent line with no dash
   * animation — use this for permanent history trails.
   */
  static?: boolean;
}

/** A dot (optionally with a pulsing ring) placed at a lat/lng. */
export interface MarkerData {
  id: string;
  lat: number;
  lng: number;
  /** CSS hex color, e.g. "#60a5fa". */
  color: string;
  /** Tooltip / label shown on hover. */
  label?: string;
  /** Dot radius in globe units. Default 0.5. */
  radius?: number;
  /** Altitude offset. Default 0.01 (sits just above surface). */
  altitude?: number;
  /** When true, renders an expanding ring around the marker. */
  pulse?: boolean;
}

interface GlobeViewProps {
  arcs?: ArcData[];
  markers?: MarkerData[];
  /** Slowly rotate the globe when no arcs are active. Default true. */
  autoRotate?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a #rrggbb hex string into an rgb triple. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Returns true if the browser supports WebGL2 or WebGL1. */
function checkWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (canvas as any).getContext('experimental-webgl')
    );
  } catch {
    return false;
  }
}

// ─── Error boundary ───────────────────────────────────────────────────────────

class GlobeErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

// ─── Fallback UI (shown when WebGL is unavailable) ───────────────────────────

function GlobeFallback({ markers }: { markers: MarkerData[] }) {
  const datacenters = markers.filter((m) => m.id !== 'user');
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-black/80 text-white/60 text-sm px-6">
      <p className="text-white/40 text-xs uppercase tracking-widest">Globe unavailable</p>
      <p className="text-center text-xs">
        WebGL is not supported in this environment.<br />
        Open the app in a browser with GPU acceleration to see the 3D globe.
      </p>
      {datacenters.length > 0 && (
        <div className="mt-2 space-y-1 text-center">
          <p className="text-white/40 text-xs mb-2">Active routing targets</p>
          {datacenters.map((m) => (
            <div key={m.id} className="flex items-center gap-2 justify-center">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
              <span className="text-xs text-white/70">{m.label ?? m.id}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dynamic import (WebGL must not run on the server) ────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GlobeGL = dynamic(() => import('react-globe.gl'), { ssr: false }) as any;

// ─── Inner globe (rendered only when WebGL is confirmed available) ────────────

function GlobeInner({ arcs, markers, autoRotate }: Required<GlobeViewProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fly camera to midpoint of the most recent animated arc
  useEffect(() => {
    if (!globeRef.current || arcs.length === 0) return;
    const arc = arcs[arcs.length - 1];
    if (arc.static) return;
    const midLat = (arc.startLat + arc.endLat) / 2;
    const midLng = (arc.startLng + arc.endLng) / 2;
    globeRef.current.pointOfView?.({ lat: midLat, lng: midLng, altitude: 2.2 }, 1000);
  }, [arcs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const arcColor = (d: ArcData) => {
    const [r, g, b] = hexToRgb(d.color);
    if (d.static) {
      return [
        `rgba(${r},${g},${b},0.25)`,
        `rgba(${r},${g},${b},0.55)`,
        `rgba(${r},${g},${b},0.55)`,
        `rgba(${r},${g},${b},0.25)`,
      ];
    }
    return [
      `rgba(${r},${g},${b},0.04)`,
      `rgba(${r},${g},${b},0.9)`,
      `rgba(${r},${g},${b},1)`,
      `rgba(${r},${g},${b},0.2)`,
    ];
  };

  const ringColor = (d: MarkerData) => (t: number) => {
    const [r, g, b] = hexToRgb(d.color);
    return `rgba(${r},${g},${b},${(1 - t).toFixed(2)})`;
  };

  const pulsingMarkers = markers.filter((m) => m.pulse);

  return (
    <div ref={containerRef} className="w-full h-full">
      {size.width > 0 && (
        <GlobeGL
          ref={globeRef}
          width={size.width}
          height={size.height}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
          atmosphereColor="rgba(80,180,255,0.22)"
          atmosphereAltitude={0.13}
          arcsData={arcs}
          arcStartLat={(d: ArcData) => d.startLat}
          arcStartLng={(d: ArcData) => d.startLng}
          arcEndLat={(d: ArcData) => d.endLat}
          arcEndLng={(d: ArcData) => d.endLng}
          arcColor={arcColor}
          arcAltitude={(d: ArcData) => d.altitude ?? 0.1}
          arcStroke={(d: ArcData) => d.static ? (d.strokeWidth ?? 0.8) : (d.strokeWidth ?? 1.5)}
          arcDashLength={(d: ArcData) => d.static ? 1 : 0.35}
          arcDashGap={(d: ArcData) => d.static ? 0 : 3}
          arcDashInitialGap={(d: ArcData) => d.static ? 0 : 0.5}
          arcDashAnimateTime={(d: ArcData) => d.static ? 0 : (d.animateTime ?? 1400)}
          pointsData={markers}
          pointLat={(d: MarkerData) => d.lat}
          pointLng={(d: MarkerData) => d.lng}
          pointColor={(d: MarkerData) => d.color}
          pointRadius={(d: MarkerData) => d.radius ?? 0.5}
          pointAltitude={(d: MarkerData) => d.altitude ?? 0.01}
          pointLabel={(d: MarkerData) => d.label ?? ''}
          ringsData={pulsingMarkers}
          ringLat={(d: MarkerData) => d.lat}
          ringLng={(d: MarkerData) => d.lng}
          ringColor={ringColor}
          ringMaxRadius={3.5}
          ringPropagationSpeed={2.5}
          ringRepeatPeriod={750}
        />
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function GlobeView({ arcs = [], markers = [], autoRotate = true }: GlobeViewProps) {
  const [webglOk, setWebglOk] = useState<boolean | null>(null);

  useEffect(() => {
    setWebglOk(checkWebGL());
  }, []);

  // Still checking (avoids flash of fallback in supported browsers)
  if (webglOk === null) {
    return <div className="w-full h-full bg-black" />;
  }

  const fallback = <GlobeFallback markers={markers} />;

  if (!webglOk) return fallback;

  return (
    <GlobeErrorBoundary fallback={fallback}>
      <GlobeInner arcs={arcs} markers={markers} autoRotate={autoRotate} />
    </GlobeErrorBoundary>
  );
}
