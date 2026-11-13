import { describe, expect, it } from "vitest";
import {
  distinctSnapshots,
  keepSnapshot,
  snapshotTime,
  SNAPSHOT_EVERY_MS,
  type PageSnapshot,
} from "./page-history";

const at = (time: number, source: string): PageSnapshot => ({ id: String(time), at: time, source });

describe("keepSnapshot", () => {
  const now = 1_800_000_000_000;

  it("keeps the page as it is when it changes", () => {
    expect(keepSnapshot([], "Old", "New", now, { since: now - 5000 })).toEqual([
      at(now - 5000, "Old"),
    ]);
  });

  it("keeps none when nothing changes or the page is new", () => {
    expect(keepSnapshot([], "Same", "Same", now)).toEqual([]);
    expect(keepSnapshot([], undefined, "New", now)).toEqual([]);
    expect(keepSnapshot([], "  ", "New", now)).toEqual([]);
  });

  it("keeps one each 10 minutes while the page changes, or sooner when forced", () => {
    const kept = [at(now - 60_000, "Before")];
    expect(keepSnapshot(kept, "Now", "Next", now)).toBe(kept);
    expect(keepSnapshot(kept, "Now", "Next", now, { force: true })).toHaveLength(2);
    expect(keepSnapshot(kept, "Now", "Next", now - 60_000 + SNAPSHOT_EVERY_MS)).toHaveLength(2);
  });

  it("keeps at most a number of them", () => {
    const kept = [at(now - SNAPSHOT_EVERY_MS, "B"), at(now - 2 * SNAPSHOT_EVERY_MS, "A")];
    expect(keepSnapshot(kept, "C", "D", now, { max: 2 }).map((s) => s.source)).toEqual(["C", "B"]);
  });
});

describe("distinctSnapshots", () => {
  it("keeps the oldest of a run with the same text", () => {
    const list = distinctSnapshots([at(3, "B"), at(1, "A"), at(4, "B"), at(2, "B")]);
    expect(list.map((s) => [s.at, s.source])).toEqual([
      [2, "B"],
      [1, "A"],
    ]);
  });
});

describe("snapshotTime", () => {
  it("names the day", () => {
    const now = new Date(2026, 10, 13, 15, 0).getTime();
    expect(snapshotTime(new Date(2026, 10, 13, 9, 5).getTime(), now)).toBe("Today, 09:05");
    expect(snapshotTime(new Date(2026, 10, 12, 23, 59).getTime(), now)).toBe("Yesterday, 23:59");
    expect(snapshotTime(new Date(2026, 10, 2, 8, 0).getTime(), now)).toBe("Nov 2, 08:00");
    expect(snapshotTime(new Date(2025, 0, 2, 8, 0).getTime(), now)).toBe("Jan 2, 2025, 08:00");
  });
});
