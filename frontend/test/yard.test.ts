import { describe, expect, it } from "vitest";
import type { LiveEvent, MapData, ZoneData } from "../src/types";
import {
  areaViews,
  duration,
  fixShare,
  nowLine,
  outcomeOf,
  planForArea,
  pointAt,
  totals,
  trackSegments,
  type RunRecord,
  type TrackPoint,
  type YardData,
} from "../src/yard";

const NOW = 1_800_000_000;
const zone = (id: number, name: string): ZoneData => ({ family: "areas", id, name, enabled: true, closed: true, points: [[0, 0], [1, 0], [1, 1]], area_m2: 10, length_m: 3 });
const map = { zones: [zone(1, "west lawn"), zone(2, "East")], docks: [], bounds: null, entry_id: "e", title: "t", serial: "s" } as MapData;
const live = (over: Partial<LiveEvent> = {}): LiveEvent => ({
  type: "live", t: NOW, connected: true, awake: true, activity: "idle", battery: 80, charging: false, error_code: 0, fault: null, pause_reason: null,
  head: "mower_pro", plan_running: false, x: 0, y: 0, phi: 0, rtk_status: 4, fix_quality: 4, satellites: 20, hdop: 1, reverse: false, ...over,
});
const yard = (over: Partial<YardData> = {}): YardData => ({
  entry_id: "e", title: "Yarbo", serial: "s", host: "1.2.3.4", reachable: true, last_seen: null,
  plans: [{ id: 5, name: "West", area_ids: [1] }, { id: 6, name: "All", area_ids: [1, 2] }], schedules: [], robot: null, runs: [], open_run: null, charges: [],
  last_completed: {}, progress: null, ...over,
});
const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  id: "1", plan_id: 5, plan: "west lawn", started_at: NOW - 100, ended_at: NOW, outcome: "completed", working_s: 3600, progress: 100, area_m2: 500,
  planned_area_m2: 500, battery_start: 90, distance_m: 1000, faults: [], head: "mower_pro", ...over,
});

describe("areas", () => {
  it("shades by the last finished plan holding the area, and by the area being worked", () => {
    const views = areaViews(map, yard({ last_completed: { "5": NOW - 86_400 }, progress: { plan_id: 6, plan: "All", percent: 3, remaining_s: 10, current_area_id: 2, finished_area_ids: [] } }), NOW);
    expect(views.map((v) => v.state)).toEqual(["done", "work"]);
    expect(views[0]!.name).toBe("West lawn");
    expect(views[0]!.line).toBe("Finished yesterday");
  });
  it("says long ago and never apart", () => {
    const views = areaViews(map, yard({ last_completed: { "5": NOW - 30 * 86_400 } }), NOW);
    expect(views[0]!.state).toBe("stale");
    expect(views[1]!.state).toBe("never");
  });
  it("previews an area with its own plan when it has one", () => {
    expect(planForArea(yard().plans, 1)?.id).toBe(5);
    expect(planForArea(yard().plans, 2)?.id).toBe(6);
    expect(planForArea(yard().plans, 3)).toBeUndefined();
  });
});

describe("the sentence at the top", () => {
  it("says the robot is out of reach, and offers nothing to press", () => {
    const line = nowLine(undefined, yard({ reachable: false, last_seen: NOW - 3600 }), NOW);
    expect(line.kind).toBe("off");
    expect(line.title).toBe("Can't reach Yarbo");
    expect(line.detail).toContain("1.2.3.4");
    expect(line.actions).toEqual([]);
  });
  it("names the fault first", () => {
    const fault = { code: 902, key: "tilted", description: "Tilted or flipped over", hint: "Set it level.", since: null };
    const line = nowLine(live({ fault, error_code: 902, plan_running: true }), yard(), NOW);
    expect(line.kind).toBe("bad");
    expect(line.title).toContain("tilted");
    expect(line.actions).toContain("resume");
  });
  it("says what is being worked, how far and how long", () => {
    const progress = { plan_id: 5, plan: "west lawn", percent: 63.4, remaining_s: 2460, current_area_id: 1, finished_area_ids: [] };
    const line = nowLine(live({ plan_running: true, activity: "working" }), yard({ progress }), NOW);
    expect(line.title).toBe("Mowing West lawn, 63%");
    expect(line.detail).toContain("41 min left");
    expect(line.actions).toEqual(["pause", "stop", "dock"]);
  });
  it("holds a blocked plan apart from a running one", () => {
    expect(nowLine(live({ activity: "waiting", plan_running: true }), yard(), NOW).kind).toBe("held");
    expect(nowLine(live({ activity: "paused", plan_running: true, pause_reason: "rain" }), yard(), NOW).title).toContain("rain");
  });
  it("offers a start only when nothing runs", () => {
    expect(nowLine(live(), yard(), NOW).actions).toEqual(["start"]);
  });
});

describe("numbers", () => {
  it("formats durations", () => {
    expect(duration(null)).toBe("–");
    expect(duration(2460)).toBe("41 min");
    expect(duration(7200)).toBe("2 h");
    expect(duration(7740)).toBe("2 h 9 min");
  });
  it("totals runs without inventing what was not measured", () => {
    const sum = totals([run(), run({ outcome: "stopped", area_m2: null, working_s: null, energy_wh: null })]);
    expect(sum.runs).toBe(2);
    expect(sum.finished).toBe(1);
    expect(sum.paceM2H).toBe(500);
    expect(sum.whPerM2).toBeNull();
  });
  it("reads a fault in a run that did not finish", () => {
    expect(outcomeOf(run({ outcome: "returned_to_dock", faults: [902] }))[0]).toBe("Fault");
    expect(outcomeOf(run())[0]).toBe("Finished");
    expect(outcomeOf(run({ ended_at: undefined, outcome: undefined }))[0]).toBe("Running");
  });
});

describe("tracks", () => {
  const points: TrackPoint[] = [
    [0, 0, 0, 4, -60, 90],
    [1, 1, 0, 4, -60, 90],
    [2, 2, 0, 5, -80, 90],
    [3, 3, 0, 5, -80, 90],
    [4, 20, 0, 5, -80, 90], // a jump: the fix moved, the robot did not
    [5, 21, 0, 5, -80, 90],
  ];
  it("colours by fix and joins the pieces, but not across a jump", () => {
    const segments = trackSegments(points, "fix");
    expect(segments.map((s) => s.cls)).toEqual(["fix-rtk", "fix-float", "fix-float"]);
    expect(segments[1]!.points[0]).toEqual([1, 0]);
    expect(segments[2]!.points).toEqual([[20, 0], [21, 0]]);
  });
  it("draws only up to the moment of a replay", () => {
    expect(trackSegments(points, "plain", 1)).toEqual([{ cls: "cut", points: [[0, 0], [1, 0]] }]);
    expect(pointAt(points, 2.5)?.[0]).toBe(2);
    expect(pointAt(points, -1)).toBeNull();
  });
  it("shares out the fix", () => {
    expect(fixShare(points)).toEqual({ rtk: 33, float: 67, other: 0 });
    expect(fixShare([])).toEqual({ rtk: 0, float: 0, other: 0 });
  });
});
