'use client';

import { useEffect, useRef, useState } from 'react';
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
  /** Arc peak height relative to globe radius (0–1). Default 0.3. */
  altitude?: number;
  /** Line stroke width in px. Default 1.5. */
  strokeWidth?: number;
  /** Duration of one animation loop in ms. Default 1400. */
  animateTime?: number;
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

// ─── Dynamic import (WebGL must not run on the server) ────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GlobeGL = dynamic(() => import('react-globe.gl'), { ssr: false }) as any;

// ─── Component ────────────────────────────────────────────────────────────────

export function GlobeView({ arcs = [], markers = [], autoRotate = true }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Track container dimensions and respond to resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Toggle globe auto-rotation based on whether arcs are active
  useEffect(() => {
    const controls = globeRef.current?.controls?.();
    if (!controls) return;
    controls.autoRotate = autoRotate && arcs.length === 0;
    controls.autoRotateSpeed = 0.35;
  }, [arcs.length, autoRotate]);

  // Fly the camera to the midpoint of the most recent arc
  useEffect(() => {
    if (!globeRef.current || arcs.length === 0) return;
    const arc = arcs[arcs.length - 1];
    const midLat = (arc.startLat + arc.endLat) / 2;
    const midLng = (arc.startLng + arc.endLng) / 2;
    globeRef.current.pointOfView?.({ lat: midLat, lng: midLng, altitude: 2.2 }, 1000);
  }, [arcs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arc color: gradient that fades in from the tail and stays bright at the head.
  // globe.gl accepts an array of CSS color strings as gradient stops (t=0 → t=1).
  const arcColor = (d: ArcData) => {
    const [r, g, b] = hexToRgb(d.color);
    return [
      `rgba(${r},${g},${b},0.04)`, // transparent tail
      `rgba(${r},${g},${b},0.9)`,  // bright mid
      `rgba(${r},${g},${b},1)`,    // bright head
      `rgba(${r},${g},${b},0.2)`,  // slight glow beyond head
    ];
  };

  // Ring color: expands outward while fading to transparent.
  // globe.gl calls this once per marker and expects a (t: number) => string back.
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
          // Globe appearance
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
          atmosphereColor="rgba(80,180,255,0.22)"
          atmosphereAltitude={0.13}
          // ── Arc layer ────────────────────────────────────────────────────
          arcsData={arcs}
          arcStartLat={(d: ArcData) => d.startLat}
          arcStartLng={(d: ArcData) => d.startLng}
          arcEndLat={(d: ArcData) => d.endLat}
          arcEndLng={(d: ArcData) => d.endLng}
          arcColor={arcColor}
          arcAltitude={(d: ArcData) => d.altitude ?? 0.3}
          arcStroke={(d: ArcData) => d.strokeWidth ?? 1.5}
          // Dash pattern: short bright streak with a long gap → "comet" look
          arcDashLength={0.35}
          arcDashGap={3}
          arcDashInitialGap={0.5}
          arcDashAnimateTime={(d: ArcData) => d.animateTime ?? 1400}
          // ── Point / marker layer ─────────────────────────────────────────
          pointsData={markers}
          pointLat={(d: MarkerData) => d.lat}
          pointLng={(d: MarkerData) => d.lng}
          pointColor={(d: MarkerData) => d.color}
          pointRadius={(d: MarkerData) => d.radius ?? 0.5}
          pointAltitude={(d: MarkerData) => d.altitude ?? 0.01}
          pointLabel={(d: MarkerData) => d.label ?? ''}
          // ── Ring / pulse layer ───────────────────────────────────────────
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
