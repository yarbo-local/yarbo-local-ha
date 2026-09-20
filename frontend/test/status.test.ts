import { describe, expect, it } from "vitest";
import { faultDetail, faultOf, statusLabel } from "../src/status";
import type { LiveEvent } from "../src/types";

const base: LiveEvent = {
  type: "live",
  t: 0,
  connected: true,
  awake: true,
  activity: "working",
  battery: 80,
  charging: false,
  error_code: 0,
  head: "mower_pro",
  plan_running: true,
  x: 0,
  y: 0,
  phi: 0,
  rtk_status: 4,
  fix_quality: 4,
  satellites: 30,
  hdop: 0.5,
  reverse: false,
};

// What the integration sent for the tilt on the West Lawn.
const tilted = {
  code: 902,
  key: "tilted",
  description: "Tilted or flipped over",
  hint: "Check the robot is level and free, then resume the plan in the Yarbo app.",
  since: new Date(2026, 8, 15, 15, 30, 48).getTime() / 1000,
};

describe("status", () => {
  it("names the fault instead of saying error", () => {
    const live = { ...base, activity: "error", error_code: 902, fault: tilted, pause_reason: "fault" };
    expect(statusLabel(live)).toBe("Tilted or flipped over");
    expect(faultDetail(tilted, "en-US", new Date(2026, 8, 15, 16, 0))).toBe("Fault 902 · since 3:30 PM");
    expect(faultDetail(tilted, "en-US", new Date(2026, 8, 16, 9, 0))).toContain("Sep 15");
  });

  it("keeps an unidentified code visible without repeating it", () => {
    const unknown = { code: 901, key: null, description: "Fault 901", hint: "…", since: null };
    const live = { ...base, activity: "error", error_code: 901, fault: unknown };
    expect(statusLabel(live)).toBe("Fault 901");
    expect(faultDetail(unknown)).toBe("");
  });

  it("falls back to the code from an older integration", () => {
    const live = { ...base, activity: "error", error_code: 902 };
    expect(faultOf(live)?.description).toBe("Fault 902");
    expect(statusLabel(live)).toBe("Fault 902");
  });

  it("says why a plan is paused", () => {
    expect(statusLabel({ ...base, activity: "paused", pause_reason: "stuck" })).toBe("Stuck");
    expect(statusLabel({ ...base, activity: "paused", pause_reason: "manual" })).toBe("Paused by you");
    expect(statusLabel({ ...base, activity: "paused", pause_reason: "unknown" })).toBe("Paused");
    expect(statusLabel(base)).toBe("Working");
  });
});
