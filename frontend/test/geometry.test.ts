import { describe, expect, it } from "vitest";
import {
  applySimilarity,
  distanceToPolyline,
  dockOutline,
  extendTrail,
  fitSimilarity,
  headingDisplayDeg,
  invertSimilarity,
  pointInPolygon,
  robotFootprint,
  toDisplay,
  trailSegments,
  type TrailPoint,
} from "../src/geometry";
import type { Point } from "../src/types";

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("robot frame to display", () => {
  it("puts west on the left and north up", () => {
    const [X, Y] = toDisplay(10, 5); // 10 m west, 5 m north
    expect(X).toBeLessThan(0);
    expect(Y).toBeLessThan(0);
  });

  it("rotates the heading so the marker points where the robot drives", () => {
    close(Math.abs(headingDisplayDeg(0)), 180); // facing +x (west): pointing left
    close(headingDisplayDeg(Math.PI / 2), -90); // facing +y (north): pointing up
    close(headingDisplayDeg(Math.PI), 0); // facing east: pointing right
  });

  it("puts the robot's nose ahead of it along phi", () => {
    const pts = robotFootprint(2, 3, Math.PI / 2);
    close(pts[0]![0], 2, 1e-12);
    close(pts[0]![1], 3.88, 1e-12);
  });
});

describe("dock outline", () => {
  it("places the charging point between the back and front edges along the approach", () => {
    const { dock, guard } = dockOutline([0, 0], 0);
    const xs = dock.map((p) => p[0]);
    close(Math.min(...xs), -0.51);
    close(Math.max(...xs), 0.36);
    const gxs = guard.map((p) => p[0]);
    close(Math.max(...gxs) - Math.min(...gxs), 2);
  });
});

describe("similarity fit", () => {
  it("recovers a known transform from two point pairs and inverts it", () => {
    const truth = { a: 0.04, b: -0.012, e: -18.5, f: 2.25 };
    const u1: Point = [120, 80];
    const u2: Point = [900, 640];
    const fit = fitSimilarity(u1, u2, applySimilarity(truth, u1), applySimilarity(truth, u2));
    expect(fit).not.toBeNull();
    for (const key of ["a", "b", "e", "f"] as const) {
      close(fit![key], truth[key], 1e-9);
    }
    const back = invertSimilarity(fit!, applySimilarity(fit!, [333, 444]));
    close(back[0], 333, 1e-6);
    close(back[1], 444, 1e-6);
  });

  it("refuses identical photo points", () => {
    expect(fitSimilarity([1, 1], [1, 1], [0, 0], [5, 5])).toBeNull();
  });
});

describe("hit testing", () => {
  const square: Point[] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ];
  it("finds points inside polygons and near lines", () => {
    expect(pointInPolygon([2, 2], square)).toBe(true);
    expect(pointInPolygon([5, 2], square)).toBe(false);
    close(distanceToPolyline([2, 1], [[0, 0], [4, 0]]), 1);
  });
});

describe("trail", () => {
  const p = (x: number, reverse = false, working = false): TrailPoint => ({ x, y: 0, t: x, reverse, working });

  it("skips tiny moves unless the mode changes", () => {
    let trail = extendTrail([], p(0));
    trail = extendTrail(trail, p(0.05));
    expect(trail).toHaveLength(1);
    trail = extendTrail(trail, p(0.05, true));
    expect(trail).toHaveLength(2);
  });

  it("splits into styled runs that share boundary points", () => {
    const trail = [p(0), p(1), p(2, true), p(3, true), p(4, false, true), p(5, false, true)];
    const segs = trailSegments(trail);
    expect(segs.map((s) => [s.reverse, s.working, s.points.length])).toEqual([
      [false, false, 2],
      [true, false, 3],
      [false, true, 3],
    ]);
    expect(segs[1]!.points[0]).toEqual(segs[0]!.points[1]);
  });
});
