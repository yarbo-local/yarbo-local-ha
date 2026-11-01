/**
 * The Yard panel with a mocked Home Assistant, for working on it without a robot.
 * ?moment=idle|work|bad|held|offline picks the situation, ?dark the theme. The map is
 * the demo map; the runs, tracks and routes are made up here.
 */
import "../src/entry";
import type { HomeAssistant, LiveEvent, MapData, Point, StreamEvent, ZoneData } from "../src/types";
import type { AreaSettings, RunRecord, Track, TrackPoint, YardData } from "../src/yard";
import site from "./site-map.json";

const params = new URLSearchParams(location.search);
const moment = params.get("moment") ?? "work";
if (params.has("dark")) {
  document.documentElement.classList.add("dark");
}

const map = site as unknown as MapData;
const MOWER = "lawn_mower.yard_demo";
const areaZones = map.zones.filter((z) => z.family === "areas");
const now = Date.now() / 1000;
const DAY = 86_400;

/** Rows across an area's bounding box, clipped to the polygon. */
function rows(zone: ZoneData, angle: number, spacing = 0.9): Point[] {
  const cos = Math.cos((angle * Math.PI) / 180);
  const sin = Math.sin((angle * Math.PI) / 180);
  const rotate = ([x, y]: Point): Point => [x * cos + y * sin, -x * sin + y * cos];
  const back = ([x, y]: Point): Point => [x * cos - y * sin, x * sin + y * cos];
  const shape = zone.points.map(rotate);
  const ys = shape.map((p) => p[1]);
  const out: Point[] = [];
  let flip = false;
  for (let y = Math.min(...ys) + spacing / 2; y < Math.max(...ys); y += spacing) {
    const hits: number[] = [];
    shape.forEach((a, i) => {
      const b = shape[(i + 1) % shape.length]!;
      if (a[1] <= y !== b[1] <= y) {
        hits.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    });
    hits.sort((p, q) => p - q);
    if (hits.length >= 2) {
      const [from, to] = flip ? [hits[hits.length - 1]!, hits[0]!] : [hits[0]!, hits[hits.length - 1]!];
      out.push(back([from, y]), back([to, y]));
      flip = !flip;
    }
  }
  return out;
}

function trackFor(zone: ZoneData, startedAt: number, upTo = 1): Track {
  const route = rows(zone, 20);
  const points: TrackPoint[] = [];
  let t = 0;
  const count = Math.floor(route.length * upTo);
  for (let i = 1; i < count; i++) {
    const [ax, ay] = route[i - 1]!;
    const [bx, by] = route[i]!;
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 0.6));
    for (let s = 0; s < steps; s++) {
      const k = s / steps;
      t += 1.2;
      const x = ax + (bx - ax) * k;
      const y = ay + (by - ay) * k;
      const weak = Math.sin(x / 6) + Math.cos(y / 5) > 1.3;
      points.push([Math.round(t * 10) / 10, x, y, weak ? 5 : 4, Math.round(-58 + y * 0.35 - (weak ? 12 : 0)), Math.round(95 - (i / route.length) * 55)]);
    }
  }
  return { started_at: startedAt, points };
}

const plans = areaZones.map((z) => ({ id: (z.id as number) + 100, name: z.name, area_ids: [z.id as number] }));
plans.push({ id: 99, name: "Whole yard", area_ids: areaZones.map((z) => z.id as number) });

function run(daysAgo: number, zone: ZoneData, overrides: Partial<RunRecord> = {}): RunRecord {
  const started = now - daysAgo * DAY;
  const area = zone.area_m2 ?? 100;
  const working = Math.round(area * 8.2 * (0.95 + Math.random() * 0.1));
  return {
    id: `${(zone.id as number) + 100}-${Math.floor(started)}`,
    plan_id: (zone.id as number) + 100,
    plan: zone.name,
    started_at: started,
    ended_at: started + working + 300,
    outcome: "completed",
    working_s: working,
    progress: 100,
    area_m2: area,
    planned_area_m2: area,
    battery_start: 100,
    battery_end: 100 - Math.round(area / 18),
    battery_used_robot: Math.round(area / 18),
    energy_wh: Math.round(area * 0.62),
    wh_per_m2: 0.62 + Math.random() * 0.08,
    distance_m: Math.round(area * 1.1),
    speed_ms: 0.5,
    obstacles: Math.floor(Math.random() * 7),
    faults: [],
    head: "mower_pro",
    ...overrides,
  };
}

const west = areaZones.find((z) => z.name === "west lawn") ?? areaZones[0]!;
const east = areaZones.find((z) => z.name === "East Lawn") ?? areaZones[0]!;
const runs: RunRecord[] = [
  run(30, west), run(27, east), run(23, west), run(20, east),
  run(16, west, { outcome: "returned_to_dock", progress: 63, area_m2: 598, faults: [902] }),
  run(15, west), run(9, east), run(6, west), run(2, east), run(1, west, { outcome: "stopped", progress: 41, area_m2: 389 }),
];
const tracks = new Map<number, Track>(runs.map((r) => [Math.floor(r.started_at), trackFor(r.plan === west.name ? west : east, r.started_at, (r.progress ?? 100) / 100)]));

const working = moment === "work" || moment === "held" || moment === "bad";
const openStart = now - 2400;
const current = trackFor(east, openStart, 0.45);
tracks.set(Math.floor(openStart), current);

const yard: YardData = {
  entry_id: "demo",
  title: "Yarbo",
  serial: "DEMO0000",
  host: "192.168.50.192",
  reachable: moment !== "offline",
  last_seen: now - 72_000,
  plans,
  schedules: [{ id: 1, plan_id: 99, name: "Saturday whole yard", enabled: true, start_time: "10:00", end_time: "14:00", week_day: 6 }],
  robot: {
    firmware: "3.14.20", body_firmware: "3.2.35", head_firmware: "1.6.2", head: "mower_pro", battery_health: 98,
    voltage: 38.6, current: -7.1, temperature: 11.5, network_path: "HaLow", halow_rssi: -61, person_detection: true, child_lock: false, stop_button_engaged: false,
  },
  runs,
  open_run: working ? run(0, east, { id: `${(east.id as number) + 100}-${Math.floor(openStart)}`, started_at: openStart, ended_at: undefined, outcome: undefined, progress: 45 }) : null,
  charges: Array.from({ length: 6 }, (_, i) => ({
    started_at: now - (i * 3 + 1) * DAY, ended_at: now - (i * 3 + 1) * DAY + 9000, on_charger_s: 9000, battery_start: 38 + i * 3, battery_end: 100, rate_pct_per_h: 26, energy_in_wh: 610, measured_s: 8000,
  })),
  last_completed: { [String((west.id as number) + 100)]: now - 6 * DAY, [String((east.id as number) + 100)]: now - 2 * DAY },
  progress: working ? { plan_id: (east.id as number) + 100, plan: east.name, percent: 45, remaining_s: 2880, current_area_id: east.id, finished_area_ids: [] } : null,
};

const settings = new Map<number, AreaSettings>(
  areaZones.map((z) => [z.id as number, { algorithm_type: 0, edge_direction_mode: 0, edge_circles: 1, route_angle: 20, blade_height: 60, plan_speed: 0.5, turn_type: 1 }]),
);

function preview(planId: number) {
  const plan = plans.find((p) => p.id === planId);
  const paths = (plan?.area_ids ?? []).flatMap((id) => {
    const zone = areaZones.find((z) => z.id === id)!;
    const s = settings.get(id)!;
    const spacing = s.algorithm_type === 1 ? 1.6 : 0.9;
    return [
      { area_id: id, kind: "fill" as const, points: rows(zone, s.route_angle ?? 0, spacing) },
      { area_id: id, kind: "edge" as const, points: [...zone.points, zone.points[0]!] },
    ];
  });
  return { plan_id: planId, total_s: 5400, paths };
}

const history = (base: number, swing: number, hours: number) =>
  Array.from({ length: 120 }, (_, i) => ({
    s: String(base + Math.sin(i / 7) * swing),
    lu: now - hours * 3600 + (i / 120) * hours * 3600,
  }));

const hass = {
  user: { is_admin: true, name: "Demo" },
  locale: { language: "en" },
  states: { [MOWER]: { state: moment === "offline" ? "unavailable" : "mowing", attributes: { friendly_name: "Yarbo" } } },
  entities: Object.fromEntries(
    [MOWER, "sensor.yarbo_demo_battery", "sensor.yarbo_demo_battery_voltage", "sensor.yarbo_demo_battery_current", "sensor.yarbo_demo_halow_signal", "sensor.yarbo_demo_satellites", "sensor.yarbo_demo_ambient_temperature"].map(
      (entity_id) => [entity_id, { entity_id, platform: "yarbo_local" }],
    ),
  ),
  async callWS<T>(msg: Record<string, unknown>): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, 60));
    switch (msg.type) {
      case "yarbo_local/yard":
        return yard as T;
      case "yarbo_local/map":
        return map as T;
      case "yarbo_local/background/get":
        return null as T;
      case "yarbo_local/track":
        return (tracks.get(Math.floor(msg.started_at as number)) ?? null) as T;
      case "yarbo_local/preview":
        return preview(msg.plan_id as number) as T;
      case "yarbo_local/obstacles":
        return { runs: [], run: null } as T;
      case "yarbo_local/area_settings":
        return (settings.get(msg.area_id as number) ?? null) as T;
      case "yarbo_local/area_settings/save": {
        const before = settings.get(msg.area_id as number)!;
        const after = { ...before, ...(msg.changes as Partial<AreaSettings>) };
        settings.set(msg.area_id as number, after);
        return { before, after } as T;
      }
      case "yarbo_local/command":
        console.info("command", msg);
        return null as T;
      case "history/history_during_period":
        return {
          "sensor.yarbo_demo_battery": history(70, 25, 24),
          "sensor.yarbo_demo_battery_voltage": history(38.5, 1.2, 24),
          "sensor.yarbo_demo_battery_current": history(-4, 5, 24),
          "sensor.yarbo_demo_halow_signal": history(-62, 7, 24),
          "sensor.yarbo_demo_satellites": history(27, 4, 24),
          "sensor.yarbo_demo_ambient_temperature": history(12, 3, 24),
        } as T;
      case "yarbo_local/data/health":
        return { robots: { DEMO0000: "Yarbo" }, datasets: [], total_bytes: 0, recorder_keep_days: 10 } as T;
      default:
        return null as T;
    }
  },
  connection: {
    async subscribeMessage<T>(callback: (event: T) => void): Promise<() => void> {
      const base: LiveEvent = {
        type: "live", t: now, connected: moment !== "offline", awake: true, activity: "idle", battery: 88, charging: false,
        error_code: 0, fault: null, pause_reason: null, head: "mower_pro", plan_running: false, x: 0, y: 0, phi: 0,
        rtk_status: 4, fix_quality: 4, satellites: 29, hdop: 0.6, reverse: false,
      };
      const points = current.points;
      let i = points.length - 1;
      const tick = () => {
        const point = points[i]!;
        const live: LiveEvent = { ...base, t: Date.now() / 1000 };
        if (moment === "offline") {
          Object.assign(live, { activity: "offline", battery: null, x: null, y: null, phi: null, fix_quality: null });
        } else if (moment === "work") {
          i = (i + 1) % points.length;
          Object.assign(live, { activity: "working", plan_running: true, x: point[1], y: point[2], phi: 0.4 });
        } else if (moment === "held") {
          Object.assign(live, { activity: "paused", plan_running: true, pause_reason: "blade_blocked", x: point[1], y: point[2] });
        } else if (moment === "bad") {
          Object.assign(live, {
            activity: "error", plan_running: true, error_code: 902, x: point[1], y: point[2],
            fault: { code: 902, key: "tilted", description: "Tilted or flipped over", hint: "Check the robot is level and free, then resume.", since: now - 240 },
          });
        } else {
          const dock = map.docks[0]?.point ?? [0, 0];
          Object.assign(live, { activity: "charging", charging: true, x: dock[0], y: dock[1] });
        }
        callback(live as StreamEvent as T);
      };
      tick();
      const timer = setInterval(tick, 700);
      return () => clearInterval(timer);
    },
  },
} as unknown as HomeAssistant;

const panel = document.getElementById("panel") as HTMLElement & Record<string, unknown>;
const route = () => ({ prefix: "/yard", path: location.pathname.replace(/^\/yard/, "") || "/overview" });
panel.hass = hass;
panel.narrow = window.innerWidth < 870;
panel.route = route();
window.addEventListener("location-changed", () => (panel.route = route()));
window.addEventListener("popstate", () => (panel.route = route()));
