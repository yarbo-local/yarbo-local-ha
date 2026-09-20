/**
 * Overlays from the robot's feedback topics. The shapes come from the steves2j
 * reverse engineering and have not yet been seen on our robot, so parsing is
 * deliberately tolerant: anything that is not recognised draws nothing.
 */

import type { Point } from "./types";

function asPoint(value: unknown): Point | null {
  if (value && typeof value === "object") {
    const { x, y } = value as { x?: unknown; y?: unknown };
    if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
      return [x, y];
    }
  }
  return null;
}

function asPath(value: unknown): Point[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: Point[] = [];
  for (const item of value) {
    const p = asPoint(item);
    if (p) {
      out.push(p);
    }
  }
  return out;
}

export interface PlanOverlay {
  visited: Point[][];
  remaining: Point[][];
}

/** ``plan_feedback.cleanPathProgress: [{clean_index, path: [{x, y}]}]``. */
export function planOverlay(data: unknown): PlanOverlay {
  const overlay: PlanOverlay = { visited: [], remaining: [] };
  const progress = (data as { cleanPathProgress?: unknown } | null)?.cleanPathProgress;
  if (!Array.isArray(progress)) {
    return overlay;
  }
  for (const item of progress) {
    const path = asPath((item as { path?: unknown } | null)?.path);
    if (path.length < 2) {
      continue;
    }
    const raw = Number((item as { clean_index?: unknown }).clean_index);
    const index = Number.isFinite(raw) ? Math.max(0, Math.min(path.length - 1, Math.floor(raw))) : 0;
    if (index > 0) {
      overlay.visited.push(path.slice(0, index + 1));
    }
    if (index < path.length - 1) {
      overlay.remaining.push(path.slice(index));
    }
  }
  return overlay;
}

/** The longest list of points anywhere in the payload, for the return-to-dock route. */
export function longestPath(data: unknown, depth = 0): Point[] {
  if (depth > 4 || !data || typeof data !== "object") {
    return [];
  }
  let best = Array.isArray(data) ? asPath(data) : [];
  for (const value of Object.values(data as Record<string, unknown>)) {
    const candidate = longestPath(value, depth + 1);
    if (candidate.length > best.length) {
      best = candidate;
    }
  }
  return best;
}

export interface ObstacleDetection {
  point: Point;
  source: string;
  distance_m: number | null;
  t: number | null;
  count: number;
}

export interface ObstacleLayer {
  runId: string | null;
  planName: string | null;
  active: boolean;
  barriers: Point[][];
  detections: ObstacleDetection[];
}

function asPair(item: unknown): Point | null {
  if (Array.isArray(item) && typeof item[0] === "number" && typeof item[1] === "number") {
    return [item[0], item[1]];
  }
  return asPoint(item);
}

function clusterPoints(raw: unknown): Point[] {
  const items = Array.isArray(raw) ? raw : (raw as { points?: unknown } | null)?.points;
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map(asPair).filter((p): p is Point => p !== null);
}

/**
 * The integration's obstacle log for one plan run:
 * ``{id, plan_name, ended, barriers: [{points}], detections: [{point, source, distance_m, t, count}]}``.
 * A bare list of clusters is accepted too.
 */
export function obstacleLayer(data: unknown): ObstacleLayer {
  const layer: ObstacleLayer = { runId: null, planName: null, active: false, barriers: [], detections: [] };
  if (Array.isArray(data)) {
    layer.barriers = data.map(clusterPoints).filter((c) => c.length > 0);
    return layer;
  }
  if (!data || typeof data !== "object") {
    return layer;
  }
  const run = data as Record<string, unknown>;
  layer.runId = typeof run.id === "string" ? run.id : null;
  layer.planName = typeof run.plan_name === "string" ? run.plan_name : null;
  layer.active = run.ended === null || run.ended === undefined;
  if (Array.isArray(run.barriers)) {
    layer.barriers = run.barriers.map(clusterPoints).filter((c) => c.length > 0);
  }
  if (Array.isArray(run.detections)) {
    for (const raw of run.detections) {
      const d = raw as Record<string, unknown>;
      const point = asPair(d.point);
      if (!point) {
        continue;
      }
      layer.detections.push({
        point,
        source: typeof d.source === "string" ? d.source : "unknown",
        distance_m: typeof d.distance_m === "number" ? d.distance_m : null,
        t: typeof d.t === "number" ? d.t : null,
        count: typeof d.count === "number" ? d.count : 1,
      });
    }
  }
  return layer;
}

/** Barrier clusters only, from either shape. */
export function obstacleClusters(data: unknown): Point[][] {
  return obstacleLayer(data).barriers;
}

/** Every point in the payload. */
export function allPoints(data: unknown, depth = 0, out: Point[] = []): Point[] {
  if (depth > 4 || !data || typeof data !== "object" || out.length > 5000) {
    return out;
  }
  const p = asPoint(data);
  if (p) {
    out.push(p);
    return out;
  }
  for (const value of Object.values(data as Record<string, unknown>)) {
    allPoints(value, depth + 1, out);
  }
  return out;
}
