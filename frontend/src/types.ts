/** The small part of Home Assistant's frontend API the card uses. */

export interface HassEntityRegistryEntry {
  entity_id: string;
  platform?: string;
  device_id?: string | null;
}

export interface HomeAssistant {
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
  connection: {
    subscribeMessage<T>(
      callback: (event: T) => void,
      msg: Record<string, unknown>,
    ): Promise<() => Promise<void> | void>;
  };
  user?: { is_admin: boolean; name?: string };
  locale?: { language: string };
  entities?: Record<string, HassEntityRegistryEntry>;
  states: Record<string, { state: string; attributes: Record<string, unknown> }>;
}

export interface CardConfig {
  type: string;
  entity: string;
  title?: string;
  height?: number;
  trail?: boolean;
  follow?: boolean;
  show_status?: boolean;
}

export type Point = [number, number];

export interface ZoneData {
  family: string;
  id: number | null;
  name: string;
  enabled: boolean;
  closed: boolean;
  points: Point[];
  area_m2: number | null;
  length_m: number;
}

export interface DockData {
  id: number | null;
  name: string;
  point: Point;
  straight_phi: number | null;
  start_point: Point | null;
}

/** ``yarbo_local/map``: metres, x west, y north. */
export interface MapData {
  entry_id: string;
  title: string;
  serial: string;
  zones: ZoneData[];
  docks: DockData[];
  bounds: [number, number, number, number] | null;
}

/** A robot fault. ``key`` is null while the code is not identified; ``since`` is epoch seconds. */
export interface Fault {
  code: number;
  key: string | null;
  description: string;
  hint: string;
  since: number | null;
}

export interface LiveEvent {
  type: "live";
  t: number;
  connected: boolean;
  awake: boolean | null;
  activity: string;
  battery: number | null;
  charging: boolean;
  error_code: number;
  fault?: Fault | null;
  pause_reason?: string | null;
  head: string;
  plan_running: boolean;
  x: number | null;
  y: number | null;
  phi: number | null;
  rtk_status: number | null;
  fix_quality: number | null;
  satellites: number | null;
  hdop: number | null;
  reverse: boolean;
}

export type StreamEvent =
  | LiveEvent
  | { type: "map_changed" }
  | { type: "feedback"; leaf: string; data: unknown };

/** Image pixels (u right, v down) to display metres: X = a u - b v + e, Y = b u + a v + f. */
export interface Similarity {
  a: number;
  b: number;
  e: number;
  f: number;
}

export interface Background {
  image: string;
  transform: Similarity;
  width: number;
  height: number;
  opacity: number;
}
