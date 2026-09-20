/** Pan and zoom state: the visible window in display metres. */

import type { Point } from "./types";

export interface View {
  cx: number;
  cy: number;
  /** Visible width in metres; height follows the element's aspect ratio. */
  width: number;
}

export interface Size {
  w: number;
  h: number;
}

export const MIN_WIDTH = 2;
export const MAX_WIDTH = 2000;

export function viewBox(view: View, size: Size): [number, number, number, number] {
  const height = view.width * (size.h / Math.max(1, size.w));
  return [view.cx - view.width / 2, view.cy - height / 2, view.width, height];
}

/** Fit display-frame bounds ``[minX, minY, maxX, maxY]`` with a margin. */
export function fitView(bounds: [number, number, number, number], size: Size, margin = 0.12): View {
  const [minX, minY, maxX, maxY] = bounds;
  const w = Math.max(maxX - minX, 4);
  const h = Math.max(maxY - minY, 4);
  const aspect = size.w / Math.max(1, size.h);
  const width = Math.max(w, h * aspect) * (1 + margin * 2);
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, width: clampWidth(width) };
}

export function clampWidth(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

/** Zoom by ``factor`` (below 1 zooms in) keeping ``anchor`` fixed on screen. */
export function zoomAt(view: View, factor: number, anchor: Point): View {
  const width = clampWidth(view.width * factor);
  const k = width / view.width;
  return { cx: anchor[0] + (view.cx - anchor[0]) * k, cy: anchor[1] + (view.cy - anchor[1]) * k, width };
}

/** Element-relative pixels to display metres. */
export function pixelToDisplay(view: View, size: Size, px: number, py: number): Point {
  const [x0, y0, w, h] = viewBox(view, size);
  return [x0 + (px / Math.max(1, size.w)) * w, y0 + (py / Math.max(1, size.h)) * h];
}

export function metresPerPixel(view: View, size: Size): number {
  return view.width / Math.max(1, size.w);
}
