import { describe, expect, it } from "vitest";
import { currentPeriod, periodOf, timeWeight } from "../src/lib/timeOfDay.js";
import { OTHER_PERIOD_WEIGHT } from "../src/config.js";

describe("time of day", () => {
    it("splits the day at 6 a.m. and 6 p.m.", () => {
        expect([5, 6, 17, 18, 0].map(periodOf)).toEqual(["night", "day", "day", "night", "night"]);
    });

    it("discounts reports from the other period and counts unknown hours fully", () => {
        expect(timeWeight(22, "night")).toBe(1);
        expect(timeWeight(22, "day")).toBe(OTHER_PERIOD_WEIGHT);
        expect(timeWeight(-1, "day")).toBe(1);
        expect(timeWeight(undefined, "night")).toBe(1);
    });

    it("reads the current period in Columbus time across daylight saving", () => {
        // 21:30 UTC is 5:30 p.m. in July (EDT) but 4:30 p.m. in January (EST): both day
        expect(currentPeriod(new Date(Date.UTC(2026, 6, 1, 21, 30)))).toBe("day");
        // 22:30 UTC is 6:30 p.m. in July but 5:30 p.m. in January
        expect(currentPeriod(new Date(Date.UTC(2026, 6, 1, 22, 30)))).toBe("night");
        expect(currentPeriod(new Date(Date.UTC(2026, 0, 15, 22, 30)))).toBe("day");
    });
});
