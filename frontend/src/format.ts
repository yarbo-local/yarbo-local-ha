/** Words and numbers for the Settings page. No DOM, so it can be tested on its own. */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** "12 Sep 2026" for one day, "12 Sep 2026 to 22 Sep 2026" for a span, "" for none. */
export function formatSpan(oldest: number | null, newest: number | null, locale?: string): string {
  const day = (s: number) =>
    new Date(s * 1000).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  if (oldest == null && newest == null) {
    return "";
  }
  const first = day((oldest ?? newest) as number);
  const last = day((newest ?? oldest) as number);
  return first === last ? first : `${first} to ${last}`;
}

export function retentionLabel(unit: string, value: number): string {
  if (unit === "runs") {
    return `The last ${value} runs`;
  }
  if (value === 0) {
    return "For good";
  }
  if (value % 365 === 0) {
    return value === 365 ? "1 year" : `${value / 365} years`;
  }
  return `${value} days`;
}

export interface DatasetText {
  title: string;
  about: string;
  unit: string;
  one: string;
}

/** "1 run", "14 runs". */
export function count(n: number, text: Pick<DatasetText, "unit" | "one">): string {
  return `${n} ${n === 1 ? text.one : text.unit}`;
}

export const DATASETS: Record<string, DatasetText> = {
  runs: {
    title: "Run summaries",
    about: "One record per run: plan, times, area, energy, distance, obstacles and faults. No positions.",
    unit: "runs",
    one: "run",
  },
  charges: {
    title: "Charge summaries",
    about: "One record per charge: battery before and after, charging speed and energy.",
    unit: "charges",
    one: "charge",
  },
  obstacles: {
    title: "Obstacle log",
    about: "Where the robot met obstacles in recent runs, as drawn on the map. Holds positions in your yard.",
    unit: "runs",
    one: "run",
  },
  plans: {
    title: "Plan memory",
    about: "When each plan last finished. Clearing it resets Last completed plan.",
    unit: "plans",
    one: "plan",
  },
  backgrounds: {
    title: "Aerial photo placement",
    about: "Where your aerial photo sits under the map, per robot. The photo itself is not stored here.",
    unit: "placements",
    one: "placement",
  },
};
