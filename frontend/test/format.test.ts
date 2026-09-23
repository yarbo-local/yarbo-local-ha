import { describe, expect, it } from "vitest";
import { DATASETS, count, formatBytes, formatSpan, retentionLabel } from "../src/format";

describe("formatBytes", () => {
  it("reads like a file manager", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(812)).toBe("812 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(250 * 1024)).toBe("250 KB");
    expect(formatBytes(3.4 * 1024 * 1024)).toBe("3.4 MB");
  });
});

describe("formatSpan", () => {
  const day = 1_758_542_400; // 22 Sep 2025, midday UTC
  it("is empty without records, one date for one day, two for a span", () => {
    expect(formatSpan(null, null, "en-GB")).toBe("");
    expect(formatSpan(day, day + 60, "en-GB")).toBe("22 Sept 2025");
    expect(formatSpan(day - 10 * 86400, day, "en-GB")).toBe("12 Sept 2025 to 22 Sept 2025");
  });
});

describe("retentionLabel", () => {
  it("says it in words", () => {
    expect(retentionLabel("days", 0)).toBe("For good");
    expect(retentionLabel("days", 30)).toBe("30 days");
    expect(retentionLabel("days", 365)).toBe("1 year");
    expect(retentionLabel("days", 730)).toBe("2 years");
    expect(retentionLabel("runs", 30)).toBe("The last 30 runs");
  });
});

describe("DATASETS", () => {
  it("names every dataset the integration reports", () => {
    expect(Object.keys(DATASETS).sort()).toEqual(["backgrounds", "charges", "obstacles", "plans", "runs"]);
  });
});

describe("count", () => {
  it("uses the singular for one", () => {
    expect(count(1, DATASETS.backgrounds!)).toBe("1 placement");
    expect(count(14, DATASETS.runs!)).toBe("14 runs");
    expect(count(0, DATASETS.charges!)).toBe("0 charges");
  });
});
