import type { CardConfig } from "./types";

/** What the card needs before its drawing code is loaded. Nothing here may import Lit. */

export const DEFAULT_HEIGHT = 440;

/** Throws the message Home Assistant shows in place of a card it cannot configure. */
export function checkConfig(config: CardConfig): void {
  if (!config || typeof config.entity !== "string" || !config.entity) {
    throw new Error("Set entity to any Yarbo Local entity, for example the robot's location tracker");
  }
}

export function cardSize(config?: CardConfig): number {
  return Math.ceil((config?.height ?? DEFAULT_HEIGHT) / 50) + 1;
}

export function gridOptions(config?: CardConfig) {
  return { columns: 12, rows: Math.ceil((config?.height ?? DEFAULT_HEIGHT) / 56) + 2, min_columns: 6, min_rows: 5 };
}
