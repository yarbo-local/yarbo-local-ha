import { describe, expect, it } from "vitest";
import { defaultEntity, entitySuggestion } from "../src/suggest";
import type { HomeAssistant } from "../src/types";

const hass = {
  entities: {
    "lawn_mower.yarbo_abc": { entity_id: "lawn_mower.yarbo_abc", platform: "yarbo_local" },
    "device_tracker.yarbo_abc_location": { entity_id: "device_tracker.yarbo_abc_location", platform: "yarbo_local" },
    "sensor.yarbo_abc_battery": { entity_id: "sensor.yarbo_abc_battery", platform: "yarbo_local" },
    "lawn_mower.other_brand": { entity_id: "lawn_mower.other_brand", platform: "husqvarna_automower" },
  },
} as unknown as HomeAssistant;

describe("suggestions", () => {
  it("offers the map for this integration's lawn mower and location", () => {
    expect(entitySuggestion(hass, "lawn_mower.yarbo_abc")).toEqual({
      config: { type: "custom:yarbo-local-card", entity: "lawn_mower.yarbo_abc" },
    });
    expect(entitySuggestion(hass, "device_tracker.yarbo_abc_location")?.config.entity).toBe(
      "device_tracker.yarbo_abc_location",
    );
  });

  it("stays out of the way for everything else", () => {
    expect(entitySuggestion(hass, "lawn_mower.other_brand")).toBeNull();
    expect(entitySuggestion(hass, "sensor.yarbo_abc_battery")).toBeNull();
    expect(entitySuggestion(hass, "light.kitchen")).toBeNull();
    expect(entitySuggestion({} as HomeAssistant, "lawn_mower.yarbo_abc")).toBeNull();
  });

  it("starts a new card on the lawn mower, else the location, else anything of ours", () => {
    expect(defaultEntity(hass)).toBe("lawn_mower.yarbo_abc");
    const noMower = { entities: { ...hass.entities } } as HomeAssistant;
    delete noMower.entities!["lawn_mower.yarbo_abc"];
    expect(defaultEntity(noMower)).toBe("device_tracker.yarbo_abc_location");
    expect(defaultEntity({} as HomeAssistant)).toBe("");
  });
});
