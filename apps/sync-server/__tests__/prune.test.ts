import { describe, it, expect } from "vitest";
import { getVersionsToPrune } from "../src/hooks/store-document";

describe("Tiered Version Pruning Unit Tests", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");

  it("should keep only one auto-save per hour for the first 24 hours", () => {
    const versions = [
      // Current hour: 12:00 to 13:00.
      // We process in desc order (newest first).
      { id: "v-newest-hour-1", createdAt: new Date("2026-07-20T11:55:00.000Z") }, // ~5 min old
      { id: "v-older-hour-1", createdAt: new Date("2026-07-20T11:45:00.000Z") }, // ~15 min old

      // Previous hour (10:00 to 11:00)
      { id: "v-newest-hour-2", createdAt: new Date("2026-07-20T10:30:00.000Z") },
      { id: "v-older-hour-2", createdAt: new Date("2026-07-20T10:10:00.000Z") },

      // Different hour within 24h
      { id: "v-single-hour-3", createdAt: new Date("2026-07-20T08:00:00.000Z") },
    ];

    const toPrune = getVersionsToPrune(versions, now);

    // Should prune the older versions in the same hour buckets
    expect(toPrune).toContain("v-older-hour-1");
    expect(toPrune).toContain("v-older-hour-2");

    // Should keep the newest in each hour bucket and the single hour version
    expect(toPrune).not.toContain("v-newest-hour-1");
    expect(toPrune).not.toContain("v-newest-hour-2");
    expect(toPrune).not.toContain("v-single-hour-3");

    expect(toPrune.length).toBe(2);
  });

  it("should keep only one auto-save per day for versions older than 24 hours", () => {
    // 24 hours ago is 2026-07-19T12:00:00.000Z
    const versions = [
      // Day 1 (older than 24h, e.g. July 18)
      { id: "v-day1-1", createdAt: new Date("2026-07-18T10:00:00.000Z") },
      { id: "v-day1-2", createdAt: new Date("2026-07-18T15:00:00.000Z") }, // newer on July 18 (processed first if sorted desc)

      // Day 2 (July 17)
      { id: "v-day2-1", createdAt: new Date("2026-07-17T09:00:00.000Z") },
      { id: "v-day2-2", createdAt: new Date("2026-07-17T22:00:00.000Z") }, // newer on July 17
    ];

    // Note: getVersionsToPrune processes in the order of the array.
    // If the input array is sorted desc (newest first):
    const sortedDesc = [...versions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const toPrune = getVersionsToPrune(sortedDesc, now);

    // For July 18, we expect v-day1-1 (older) to be pruned, keeping v-day1-2
    expect(toPrune).toContain("v-day1-1");
    expect(toPrune).not.toContain("v-day1-2");

    // For July 17, we expect v-day2-1 (older) to be pruned, keeping v-day2-2
    expect(toPrune).toContain("v-day2-1");
    expect(toPrune).not.toContain("v-day2-2");

    expect(toPrune.length).toBe(2);
  });

  it("should handle mixed boundaries correctly", () => {
    const versions = [
      // Within 24h: July 20 11:30 (30 min ago), July 20 11:00 (1h ago) - same hour, prune older
      { id: "v-recent-1", createdAt: new Date("2026-07-20T11:30:00.000Z") },
      { id: "v-recent-2", createdAt: new Date("2026-07-20T11:00:00.000Z") },

      // Within 24h but different hour: July 20 05:00 (7h ago) - keep
      { id: "v-recent-different-hour", createdAt: new Date("2026-07-20T05:00:00.000Z") },

      // Older than 24h (e.g. July 19 09:00 - now is July 20 12:00)
      { id: "v-old-day1-1", createdAt: new Date("2026-07-19T09:00:00.000Z") },
      { id: "v-old-day1-2", createdAt: new Date("2026-07-19T08:00:00.000Z") }, // same day, prune older
    ];

    const sortedDesc = [...versions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const toPrune = getVersionsToPrune(sortedDesc, now);

    expect(toPrune).toContain("v-recent-2"); // pruned (same hour as v-recent-1)
    expect(toPrune).not.toContain("v-recent-1"); // kept
    expect(toPrune).not.toContain("v-recent-different-hour"); // kept
    expect(toPrune).toContain("v-old-day1-2"); // pruned (same day as v-old-day1-1)
    expect(toPrune).not.toContain("v-old-day1-1"); // kept

    expect(toPrune.length).toBe(2);
  });
});
