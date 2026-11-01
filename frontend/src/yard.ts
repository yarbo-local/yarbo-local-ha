/** What the Yard panel says about the yard. No DOM, so it can be tested on its own. */

import { PAUSE_LABEL, faultOf } from "./status";
import type { LiveEvent, MapData, Point, ZoneData } from "./types";

export interface PlanData {
  id: number;
  name: string;
  area_ids: number[];
}

export interface RunRecord {
  id: string | null;
  plan_id: number | null;
  plan: string | null;
  started_at: number;
  ended_at?: number;
  outcome?: string;
  working_s: number | null;
  progress: number | null;
  area_m2: number | null;
  planned_area_m2: number | null;
  battery_start: number | null;
  battery_end?: number | null;
  battery_used_robot?: number | null;
  energy_wh?: number | null;
  wh_per_m2?: number | null;
  distance_m: number | null;
  speed_ms?: number | null;
  obstacles?: number | null;
  faults: number[];
  head: string | null;
}

export interface ChargeRecord {
  started_at: number;
  ended_at: number;
  on_charger_s: number;
  battery_start: number | null;
  battery_end: number | null;
  rate_pct_per_h: number | null;
  energy_in_wh: number | null;
}

export interface ScheduleData {
  id: number;
  plan_id: number | null;
  name: string;
  enabled: boolean;
  start_time: string;
  end_time: string;
  week_day: number | null;
}

export interface RobotFacts {
  firmware: string | null;
  body_firmware: string | null;
  head_firmware: string | null;
  head: string | null;
  battery_health: number | null;
  voltage: number | null;
  current: number | null;
  temperature: number | null;
  network_path: string | null;
  halow_rssi: number | null;
  person_detection: boolean | null;
  child_lock: boolean | null;
  stop_button_engaged: boolean | null;
}

export interface Progress {
  plan_id: number | null;
  plan: string | null;
  percent: number | null;
  remaining_s: number | null;
  current_area_id: number | null;
  finished_area_ids: number[];
}

/** ``yarbo_local/yard``. */
export interface YardData {
  entry_id: string;
  title: string;
  serial: string;
  host: string | null;
  reachable: boolean;
  last_seen: number | null;
  plans: PlanData[];
  schedules: ScheduleData[];
  robot: RobotFacts | null;
  runs: RunRecord[];
  open_run: RunRecord | null;
  charges: ChargeRecord[];
  last_completed: Record<string, number>;
  progress?: Progress | null;
}

/** ``[seconds from the start, x, y, fix, HaLow dBm, battery]``. */
export type TrackPoint = [number, number, number, number | null, number | null, number | null];

export interface Track {
  started_at: number;
  points: TrackPoint[];
}

export interface RoutePath {
  area_id: number | null;
  kind: "fill" | "edge";
  points: Point[];
}

export interface Route {
  plan_id: number | null;
  total_s: number | null;
  paths: RoutePath[];
}

export interface AreaSettings {
  algorithm_type: number | null;
  edge_direction_mode: number | null;
  edge_circles: number | null;
  route_angle: number | null;
  blade_height: number | null;
  plan_speed: number | null;
  turn_type: number | null;
}

// -- areas

const WEEK_S = 7 * 86_400;

export type AreaState = "work" | "done" | "stale" | "never";

export interface AreaView {
  zone: ZoneData;
  id: number;
  name: string;
  plans: PlanData[];
  lastDone: number | null;
  state: AreaState;
  line: string;
}

export function titleCase(name: string): string {
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "Unnamed";
}

export function areaViews(map: MapData | undefined, yard: YardData | undefined, now: number): AreaView[] {
  if (!map) {
    return [];
  }
  const plans = yard?.plans ?? [];
  return map.zones
    .filter((z) => z.family === "areas" && z.id !== null)
    .map((zone) => {
      const id = zone.id as number;
      const own = plans.filter((p) => p.area_ids.includes(id));
      const done = own
        .map((p) => yard?.last_completed[String(p.id)])
        .filter((at): at is number => typeof at === "number");
      const lastDone = done.length ? Math.max(...done) : null;
      const working = yard?.progress?.current_area_id === id;
      const state: AreaState = working
        ? "work"
        : lastDone === null
          ? "never"
          : now - lastDone <= WEEK_S
            ? "done"
            : "stale";
      const line = working
        ? "Working now"
        : lastDone === null
          ? "No finished run on record"
          : `Finished ${relativeDay(lastDone, now)}`;
      return { zone, id, name: titleCase(zone.name), plans: own, lastDone, state, line };
    });
}

/** The plan to preview an area with: its own if it has one, else the first that holds it. */
export function planForArea(plans: PlanData[], areaId: number): PlanData | undefined {
  const holding = plans.filter((p) => p.area_ids.includes(areaId));
  return holding.find((p) => p.area_ids.length === 1) ?? holding[0];
}

// -- the sentence at the top of the page

export type NowKind = "off" | "bad" | "work" | "held" | "idle";
export type CommandName = "start" | "pause" | "resume" | "stop" | "dock";

export interface NowLine {
  kind: NowKind;
  title: string;
  detail: string;
  percent: number | null;
  actions: CommandName[];
}

const DOING: Record<string, string> = {
  mower: "Mowing",
  mower_pro: "Mowing",
  snow_blower: "Clearing snow from",
  leaf_blower: "Blowing leaves from",
  trimmer: "Trimming",
};

const verb = (head: string | null | undefined): string => DOING[head ?? ""] ?? "Working on";

export function nowLine(live: LiveEvent | undefined, yard: YardData | undefined, now: number, locale?: string): NowLine {
  const name = yard?.title ?? "The robot";
  if (!yard?.reachable || (live && !live.connected)) {
    const seen = yard?.last_seen
      ? `Last heard ${relativeDay(yard.last_seen, now)} at ${clock(yard.last_seen, locale)}. `
      : "";
    return {
      kind: "off",
      title: `Can't reach ${name}`,
      detail: `${seen}Home Assistant keeps trying${yard?.host ? ` at ${yard.host}` : ""}. Everything below is what it last knew.`,
      percent: null,
      actions: [],
    };
  }
  if (!live) {
    return { kind: "idle", title: "Reading the robot…", detail: "", percent: null, actions: [] };
  }
  const plan = yard.progress?.plan ?? yard.open_run?.plan ?? null;
  const planText = plan ? titleCase(plan) : "the plan";
  const fault = faultOf(live);
  if (fault) {
    return {
      kind: "bad",
      title: `${name} needs you: ${fault.description.toLowerCase()}`,
      detail: `${fault.hint}${fault.since ? ` Since ${clock(fault.since, locale)}.` : ""}`,
      percent: yard.progress?.percent ?? null,
      actions: live.plan_running || yard.open_run ? ["resume", "stop", "dock"] : ["dock"],
    };
  }
  if (live.activity === "paused" || (live.pause_reason && live.plan_running)) {
    const reason = (live.pause_reason && PAUSE_LABEL[live.pause_reason]) || "Paused";
    return {
      kind: "held",
      title: `${reason}: ${planText}`,
      detail: batteryText(live),
      percent: yard.progress?.percent ?? null,
      actions: ["resume", "stop", "dock"],
    };
  }
  if (live.activity === "waiting") {
    return {
      kind: "held",
      title: `Waiting: the way to ${planText} may be blocked`,
      detail: "The robot reports no fault. It is holding still with the plan running.",
      percent: yard.progress?.percent ?? null,
      actions: ["stop", "dock"],
    };
  }
  if (live.plan_running) {
    const percent = yard.progress?.percent ?? null;
    const left = yard.progress?.remaining_s;
    return {
      kind: "work",
      title: `${verb(live.head)} ${planText}${percent !== null ? `, ${Math.round(percent)}%` : ""}`,
      detail: [left ? `about ${duration(left)} left` : "", batteryText(live)].filter(Boolean).join(" · "),
      percent,
      actions: ["pause", "stop", "dock"],
    };
  }
  if (live.activity === "returning") {
    return { kind: "work", title: "Heading home", detail: batteryText(live), percent: null, actions: ["stop"] };
  }
  const last = yard.runs[yard.runs.length - 1];
  return {
    kind: "idle",
    title: "Nothing running",
    detail: [batteryText(live), last ? `Last run ${relativeDay(last.ended_at ?? last.started_at, now)}: ${runTitle(last)}.` : ""]
      .filter(Boolean)
      .join(" "),
    percent: null,
    actions: ["start"],
  };
}

function batteryText(live: LiveEvent): string {
  if (live.battery === null) {
    return "";
  }
  return `${live.charging ? "Charging" : "Battery"} ${live.battery}%.`;
}

// -- words and numbers

const OUTCOME: Record<string, [string, "ok" | "warn" | "bad" | ""]> = {
  completed: ["Finished", "ok"],
  returned_to_dock: ["Came home early", "warn"],
  stopped: ["Stopped", "warn"],
  superseded: ["Replaced", ""],
};

export function outcomeOf(run: RunRecord): [string, "ok" | "warn" | "bad" | ""] {
  if (run.faults?.length && run.outcome !== "completed") {
    return ["Fault", "bad"];
  }
  return OUTCOME[run.outcome ?? ""] ?? [run.ended_at ? (run.outcome ?? "Ended") : "Running", run.ended_at ? "" : "ok"];
}

export function runTitle(run: RunRecord): string {
  const plan = run.plan ? titleCase(run.plan) : run.plan_id !== null ? `Plan ${run.plan_id}` : "A plan";
  return plan;
}

export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) {
    return "–";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${minutes / 60} h`;
}

export function clock(at: number, locale?: string): string {
  return new Date(at * 1000).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

export function shortDate(at: number, locale?: string): string {
  return new Date(at * 1000).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export function relativeDay(at: number, now: number): string {
  const startOfDay = (s: number) => {
    const d = new Date(s * 1000);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  return new Date(at * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// -- totals and trends for the History page

export interface Totals {
  runs: number;
  finished: number;
  workingS: number;
  distanceM: number;
  areaM2: number;
  obstacles: number;
  faults: number;
  paceM2H: number | null;
  whPerM2: number | null;
}

export function totals(runs: RunRecord[]): Totals {
  const sum = (pick: (r: RunRecord) => number | null | undefined) =>
    runs.reduce((total, r) => total + (pick(r) ?? 0), 0);
  const workingS = sum((r) => r.working_s);
  const areaM2 = sum((r) => r.area_m2);
  const energy = runs.filter((r) => r.energy_wh && r.area_m2);
  const energyArea = energy.reduce((total, r) => total + (r.area_m2 ?? 0), 0);
  return {
    runs: runs.length,
    finished: runs.filter((r) => r.outcome === "completed").length,
    workingS,
    distanceM: sum((r) => r.distance_m),
    areaM2,
    obstacles: sum((r) => r.obstacles),
    faults: sum((r) => r.faults?.length ?? 0),
    paceM2H: workingS > 0 && areaM2 > 0 ? (areaM2 / workingS) * 3600 : null,
    whPerM2: energyArea > 0 ? energy.reduce((t, r) => t + (r.energy_wh ?? 0), 0) / energyArea : null,
  };
}

export type Series = Array<[number, number]>;

export function trend(runs: RunRecord[], value: (run: RunRecord) => number | null | undefined): Series {
  const out: Series = [];
  for (const run of runs) {
    const v = value(run);
    if (typeof v === "number" && Number.isFinite(v)) {
      out.push([run.started_at, v]);
    }
  }
  return out;
}

export function pace(run: RunRecord): number | null {
  return run.area_m2 && run.working_s ? (run.area_m2 / run.working_s) * 3600 : null;
}

// -- drawing a track

export type TrackColour = "fix" | "signal" | "plain";

export interface ColouredSegment {
  cls: string;
  points: Point[];
}

function fixClass(fix: number | null): string {
  return fix === 4 ? "fix-rtk" : fix === 5 ? "fix-float" : fix ? "fix-gps" : "fix-none";
}

function signalClass(dbm: number | null): string {
  if (dbm === null) {
    return "sig-none";
  }
  return dbm >= -65 ? "sig-good" : dbm >= -78 ? "sig-fair" : "sig-poor";
}

const MAX_JUMP_M = 3;

/** Unbroken pieces of a track that share a colour; a jump in position breaks the line. */
export function trackSegments(points: TrackPoint[], colour: TrackColour, until = Infinity): ColouredSegment[] {
  const out: ColouredSegment[] = [];
  let current: ColouredSegment | null = null;
  let previous: TrackPoint | null = null;
  for (const point of points) {
    if (point[0] > until) {
      break;
    }
    const cls = colour === "fix" ? fixClass(point[3]) : colour === "signal" ? signalClass(point[4]) : "cut";
    const jumped = previous !== null && Math.hypot(point[1] - previous[1], point[2] - previous[2]) > MAX_JUMP_M;
    if (!current || current.cls !== cls || jumped) {
      const start: Point[] = previous && !jumped ? [[previous[1], previous[2]]] : [];
      current = { cls, points: start };
      out.push(current);
    }
    current.points.push([point[1], point[2]]);
    previous = point;
  }
  return out.filter((s) => s.points.length >= 2);
}

/** The share of a track's points at each fix quality, as whole percentages. */
export function fixShare(points: TrackPoint[]): { rtk: number; float: number; other: number } {
  if (!points.length) {
    return { rtk: 0, float: 0, other: 0 };
  }
  const rtk = points.filter((p) => p[3] === 4).length;
  const float = points.filter((p) => p[3] === 5).length;
  const percent = (n: number) => Math.round((n / points.length) * 100);
  return { rtk: percent(rtk), float: percent(float), other: percent(points.length - rtk - float) };
}

/** The last point at or before a moment in the run. */
export function pointAt(points: TrackPoint[], seconds: number): TrackPoint | null {
  let found: TrackPoint | null = null;
  for (const point of points) {
    if (point[0] > seconds) {
      break;
    }
    found = point;
  }
  return found;
}

export const PATTERNS: Array<[number, string]> = [
  [0, "Rows"],
  [1, "Spiral"],
  [4, "Rows, fewer turns"],
];

export const DIRECTIONS: Array<[number, string]> = [
  [0, "Counter-clockwise"],
  [2, "Clockwise"],
];
