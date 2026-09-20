import type { Fault, LiveEvent } from "./types";

export const ACTIVITY_LABEL: Record<string, string> = {
  sleeping: "Sleeping",
  idle: "Idle",
  calculating_route: "Calculating route",
  heading_to_area: "Heading to area",
  working: "Working",
  waypoint: "Waypoint",
  completed: "Completed",
  paused: "Paused",
  returning: "Returning",
  charging: "Charging",
  error: "Fault",
};

// StateMSG.planning_paused as the integration names it. Only "fault" is confirmed on the wire.
export const PAUSE_LABEL: Record<string, string> = {
  manual: "Paused by you",
  low_battery_recharging: "Paused: low battery",
  power_restart: "Paused: power restart",
  emergency_stop: "Emergency stop",
  bumper: "Paused: bumper hit",
  stuck: "Stuck",
  fault: "Paused: fault",
};

/** The fault, including from an integration too old to send one. */
export function faultOf(live: LiveEvent): Fault | null {
  if (live.fault) {
    return live.fault;
  }
  if (live.error_code) {
    return {
      code: live.error_code,
      key: null,
      description: `Fault ${live.error_code}`,
      hint: "Update Yarbo Local to see what this fault means, or check the Yarbo app.",
      since: null,
    };
  }
  return null;
}

/** What the status chip says. Never a bare "Error". */
export function statusLabel(live: LiveEvent): string {
  const fault = faultOf(live);
  if (fault) {
    return fault.description;
  }
  if (live.activity === "paused" && live.pause_reason) {
    return PAUSE_LABEL[live.pause_reason] ?? "Paused";
  }
  return ACTIVITY_LABEL[live.activity] ?? live.activity;
}

/** "Fault 902 · since 3:30 PM". The code is left out when the description already is the code. */
export function faultDetail(fault: Fault, locale?: string, now: Date = new Date()): string {
  const parts: string[] = [];
  if (fault.key) {
    parts.push(`Fault ${fault.code}`);
  }
  if (fault.since) {
    const at = new Date(fault.since * 1000);
    const sameDay = at.toDateString() === now.toDateString();
    const when = sameDay
      ? at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
      : at.toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    parts.push(`since ${when}`);
  }
  return parts.join(" · ");
}
