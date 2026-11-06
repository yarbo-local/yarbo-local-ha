import type { MapOverlay } from "./yarbo-local-card";
import type { CardConfig, HomeAssistant, LiveEvent, MapData } from "./types";
import type { YardData } from "./yard";

/** The map card as the pages use it. */
export interface MapElement extends HTMLElement {
  hass?: HomeAssistant;
  overlay?: MapOverlay;
  zoneStates?: Record<number, string>;
  highlight?: number | null;
  hideLive?: boolean;
  setConfig(config: CardConfig): void;
}

/** What the panel hands every page. */
export interface YardContext {
  hass: HomeAssistant;
  entity: string;
  yard?: YardData;
  map?: MapData;
  live?: LiveEvent;
  admin: boolean;
  narrow: boolean;
  card(key: string, height: number): MapElement;
  go(path: string): void;
  refresh(): Promise<void>;
}
