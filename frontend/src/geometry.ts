/**
 * Geometry in two frames.
 *
 * The robot's frame: metres, x points WEST, y points NORTH, phi is radians from +x
 * toward +y. Verified against RTK fix on firmware 3.14.11 (RMS 0.2 m).
 *
 * The display frame (SVG user units, still metres): X points EAST, Y points SOUTH,
 * so north is up on screen. X = -x, Y = -y. That is a 180 degree rotation, not a
 * mirror, so shapes keep their handedness.
 */

import type { Point, Similarity } from "./types";

export const toDisplay = (x: number, y: number): Point => [-x, -y];

/** Screen rotation in degrees (SVG, clockwise positive) for a heading phi. */
export function headingDisplayDeg(phi: number): number {
  return (Math.atan2(-Math.sin(phi), -Math.cos(phi)) * 180) / Math.PI;
}

function rotate(p: Point, phi: number): Point {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

/**
 * Dock outline and 2 m guard square, in the robot frame. Dimensions from the steves2j
 * map card: the charging point sits 0.51 m from the back edge and 0.36 m from the
 * front edge along the approach heading, 0.63 m wide.
 */
export function dockOutline(point: Point, straightPhi: number): { dock: Point[]; guard: Point[] } {
  const forward: Point = [Math.cos(straightPhi), Math.sin(straightPhi)];
  const side: Point = [-forward[1], forward[0]];
  const at = (along: number, across: number): Point => [
    point[0] + forward[0] * along + side[0] * across,
    point[1] + forward[1] * along + side[1] * across,
  ];
  const halfWidth = 0.315;
  const dock = [at(-0.51, -halfWidth), at(-0.51, halfWidth), at(0.36, halfWidth), at(0.36, -halfWidth)];
  const centre = (0.36 - 0.51) / 2;
  const guard = [at(centre - 1, -1), at(centre - 1, 1), at(centre + 1, 1), at(centre + 1, -1)];
  return { dock, guard };
}

/** Robot footprint in the robot frame: a 1.3 m by 0.55 m outline with a pointed nose. */
export function robotFootprint(x: number, y: number, phi: number): Point[] {
  const body: Point[] = [
    [0.88, 0],
    [0.55, 0.275],
    [-0.42, 0.275],
    [-0.42, -0.275],
    [0.55, -0.275],
  ];
  return body.map((p) => {
    const r = rotate(p, phi);
    return [x + r[0], y + r[1]];
  });
}

// -- similarity fit for the aerial image ------------------------------------------

export function fitSimilarity(u1: Point, u2: Point, w1: Point, w2: Point): Similarity | null {
  const du: Point = [u2[0] - u1[0], u2[1] - u1[1]];
  const dw: Point = [w2[0] - w1[0], w2[1] - w1[1]];
  const den = du[0] * du[0] + du[1] * du[1];
  if (den < 1e-9) {
    return null;
  }
  const a = (dw[0] * du[0] + dw[1] * du[1]) / den;
  const b = (dw[1] * du[0] - dw[0] * du[1]) / den;
  return { a, b, e: w1[0] - (a * u1[0] - b * u1[1]), f: w1[1] - (b * u1[0] + a * u1[1]) };
}

export function applySimilarity(s: Similarity, u: Point): Point {
  return [s.a * u[0] - s.b * u[1] + s.e, s.b * u[0] + s.a * u[1] + s.f];
}

export function invertSimilarity(s: Similarity, w: Point): Point {
  const k = s.a * s.a + s.b * s.b;
  const dx = w[0] - s.e;
  const dy = w[1] - s.f;
  return [(s.a * dx + s.b * dy) / k, (-s.b * dx + s.a * dy) / k];
}

export function svgMatrix(s: Similarity): string {
  return `matrix(${s.a} ${s.b} ${-s.b} ${s.a} ${s.e} ${s.f})`;
}

// -- hit testing --------------------------------------------------------------------

export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function distanceToPolyline(p: Point, line: Point[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
  }
  return best;
}

// -- trail --------------------------------------------------------------------------

export interface TrailPoint {
  x: number;
  y: number;
  t: number;
  reverse: boolean;
  working: boolean;
}

/** Append a pose when the robot moved at least ``minStep`` metres or its mode changed. */
export function extendTrail(
  trail: TrailPoint[],
  next: TrailPoint,
  minStep = 0.15,
  maxPoints = 5000,
): TrailPoint[] {
  const last = trail[trail.length - 1];
  if (
    last &&
    Math.hypot(next.x - last.x, next.y - last.y) < minStep &&
    last.reverse === next.reverse &&
    last.working === next.working
  ) {
    return trail;
  }
  const out = trail.length >= maxPoints ? trail.slice(trail.length - maxPoints + 1) : trail.slice();
  out.push(next);
  return out;
}

export interface TrailSegment {
  points: Point[];
  reverse: boolean;
  working: boolean;
}

/** Split the trail into runs with the same styling; runs share their boundary point. */
export function trailSegments(trail: TrailPoint[]): TrailSegment[] {
  const segments: TrailSegment[] = [];
  for (const p of trail) {
    const point: Point = [p.x, p.y];
    const current: TrailSegment | undefined = segments[segments.length - 1];
    if (current && current.reverse === p.reverse && current.working === p.working) {
      current.points.push(point);
      continue;
    }
    const previous: Point | undefined = current ? current.points[current.points.length - 1] : undefined;
    segments.push({ points: previous ? [previous, point] : [point], reverse: p.reverse, working: p.working });
  }
  return segments.filter((s) => s.points.length >= 2);
}

export function niceStep(span: number): number {
  const target = span / 5;
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  return steps.find((s) => s >= target) ?? 1000;
}
