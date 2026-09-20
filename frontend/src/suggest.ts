import type { CardConfig, HomeAssistant } from "./types";

/** Entities that stand for the robot as a whole, best first. */
const ROBOT_DOMAINS = ["lawn_mower", "device_tracker"];

function ours(hass: HomeAssistant, entityId: string): boolean {
  return hass.entities?.[entityId]?.platform === "yarbo_local";
}

/**
 * Home Assistant asks this when someone picks an entity and looks for a card to show it.
 * The map is offered for a Yarbo Local robot's lawn mower or location, and for nothing else.
 */
export function entitySuggestion(hass: HomeAssistant, entityId: string): { config: Partial<CardConfig> } | null {
  const domain = entityId.split(".", 1)[0] ?? "";
  if (!ROBOT_DOMAINS.includes(domain) || !ours(hass, entityId)) {
    return null;
  }
  return { config: { type: "custom:yarbo-local-card", entity: entityId } };
}

/** The entity a new card starts with: the lawn mower if there is one, else the location. */
export function defaultEntity(hass: HomeAssistant): string {
  const mine = Object.values(hass.entities ?? {}).filter((e) => e.platform === "yarbo_local");
  for (const domain of ROBOT_DOMAINS) {
    const found = mine.find((e) => e.entity_id.startsWith(`${domain}.`));
    if (found) {
      return found.entity_id;
    }
  }
  return mine[0]?.entity_id ?? "";
}
