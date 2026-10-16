import { describe, expect, it } from "vitest";
import { buildCrimes, createOffenseScorer, parseCoordinates, parseList, parseOccurred } from "../scripts/crimeData.mjs";

describe("parsers", () => {
    it("parses 12-hour timestamps", () => {
        expect(parseOccurred("8/1/2023 12:55:00 AM")).toEqual(new Date(2023, 7, 1, 0, 55, 0));
        expect(parseOccurred("8/1/2023 12:05:00 PM")).toEqual(new Date(2023, 7, 1, 12, 5, 0));
        expect(parseOccurred("N/A")).toBeNull();
    });

    it("parses list strings with commas inside items", () => {
        expect(parseList("['291102.12 - Robbery', \"290313.13C - Assault, Simple\"]"))
            .toEqual(["291102.12 - Robbery", "290313.13C - Assault, Simple"]);
        expect(parseList(undefined)).toEqual([]);
    });

    it("reads either coordinate format", () => {
        expect(parseCoordinates({ Latitude: "39.9", Longitude: "-83" })).toEqual([39.9, -83]);
        expect(parseCoordinates({ Coordinates: "-83, 39.9" })).toEqual([39.9, -83]);
    });
});

describe("buildCrimes", () => {
    const scorer = createOffenseScorer(
        new Map([["1 - Robbery", "Robbery"]]),
        new Map([["Robbery", 20], ["Theft", 60], ["Motor Vehicle Theft", 50]]),
    );

    it("falls back to the longest matching category name", () => {
        expect(scorer("1 - Robbery")).toBe(20);
        expect(scorer("9 - Motor Vehicle Theft _ Auto")).toBe(50);
        expect(scorer("9 - Unknown")).toBeNull();
    });

    it("merges rows per report, keeps the most severe offense and drops personal fields", () => {
        const base = { Latitude: "39.95", Longitude: "-83.0", "Victim Names": "['Someone']", "Report Narrative": "text" };
        const { output, reportCount } = buildCrimes([
            { ...base, "Report Number": "A", Occurred: "1/1/2023 1:00:00 PM", "Offense Descriptions": "['9 - Theft']" },
            { ...base, "Report Number": "A", Occurred: "1/1/2023 1:00:00 PM", "Offense Descriptions": "['1 - Robbery']" },
            { ...base, "Report Number": "B", Occurred: "1/1/2022 1:00:00 PM", "Offense Descriptions": "['1 - Robbery']" },
        ], scorer);

        expect(reportCount).toBe(2);
        expect(output.referenceDate).toBe("2023-01-01");
        const [recent, yearOld] = output.crimes;
        expect(recent).toEqual([39.95, -83, 0.64]);
        expect(yearOld[2]).toBeCloseTo(0.32, 2);
        expect(JSON.stringify(output)).not.toMatch(/Someone|text/);
    });

    it("drops reports geocoded outside Columbus", () => {
        const row = { "Report Number": "C", Occurred: "1/1/2023 1:00:00 PM", "Offense Descriptions": "['1 - Robbery']" };
        const { output, outside } = buildCrimes([
            { ...row, Latitude: "-33.9", Longitude: "151.0" },
            { ...row, "Report Number": "D", Latitude: "39.96", Longitude: "-83.0" },
        ], scorer);
        expect(outside).toBe(1);
        expect(output.crimes).toHaveLength(1);
    });
});
