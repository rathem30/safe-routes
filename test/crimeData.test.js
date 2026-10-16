import { describe, expect, it } from "vitest";
import { countsOsuIncident, createTextScorer, decay, mergeOsuLog, parseOccurred, weighIncidents } from "../scripts/crimeData.mjs";
import { parseCsv } from "../scripts/sources/osu.mjs";

describe("parseOccurred", () => {
    it("parses 12-hour timestamps", () => {
        expect(parseOccurred("8/1/2023 12:55:00 AM")).toEqual(new Date(2023, 7, 1, 0, 55, 0));
        expect(parseOccurred("8/1/2023 12:05:00 PM")).toEqual(new Date(2023, 7, 1, 12, 5, 0));
        expect(parseOccurred("")).toBeNull();
    });
});

describe("createTextScorer", () => {
    const score = createTextScorer(new Map([["Robbery", 10], ["Theft", 30], ["Motor Vehicle Theft", 35], ["Criminal Trespass", 50]]));

    it("prefers the longest matching category", () => {
        expect(score("Motor Vehicle Theft _ auto")).toBe(35);
    });

    it("takes the most severe of several offenses", () => {
        expect(score("Criminal Trespass (CCC); Robbery _ force")).toBe(10);
    });

    it("ignores offenses with no category", () => {
        expect(score("Possession of Drugs _ marijuana")).toBeNull();
    });
});

describe("weighIncidents", () => {
    const now = new Date(2026, 9, 15);

    it("decays weight by age and drops faded reports", () => {
        const crimes = weighIncidents([
            { lat: 39.96, lon: -83, occurred: now, score: 20 },
            { lat: 39.96, lon: -83, occurred: new Date(2025, 9, 15), score: 20 },
            { lat: 39.96, lon: -83, occurred: new Date(2016, 0, 1), score: 70 },
        ], now);
        expect(crimes).toHaveLength(2);
        expect(crimes[0]).toEqual([39.96, -83, 0.64]);
        expect(crimes[1][2]).toBeCloseTo(0.32, 2);
    });

    it("never counts future dates as extra weight", () => {
        expect(decay(-10)).toBe(1);
    });
});

describe("OSU log", () => {
    const csv = [
        "Case Number,Date/Time Occurrence End,Date/Time Occurrence Start,Date/Time Reported,Disposition,General Location,Measure Names,Offenses",
        "P1,,9/4/2026 9:20:00 PM,9/4/2026 9:25:00 PM,Closed,Ohio Union ,Disposition,\"Disorderly Conduct (CCC) - Intox, risk\"",
        "P2,,,9/5/2026 1:00:00 AM,Unfounded,Morrill Tower,Disposition,Theft",
        "P0,,1/1/2020 1:00:00 AM,1/1/2020 1:00:00 AM,Closed,Old Hall,Disposition,Theft",
    ].join("\r\n");

    it("parses quoted fields that contain commas", () => {
        const rows = parseCsv(csv);
        expect(rows).toHaveLength(3);
        expect(rows[0].Offenses).toBe("Disorderly Conduct (CCC) - Intox, risk");
    });

    it("merges cases, falls back to the reported date and drops expired ones", () => {
        const archive = { P0: { occurred: "2020-01-01T06:00:00.000Z", location: "Old Hall", offenses: "Theft", disposition: "Closed" } };
        const added = mergeOsuLog(archive, parseCsv(csv), new Date(2024, 0, 1));
        expect(added).toBe(2);
        expect(Object.keys(archive).sort()).toEqual(["P1", "P2"]);
        expect(archive.P1.location).toBe("Ohio Union");
        expect(new Date(archive.P2.occurred)).toEqual(new Date(2026, 8, 5, 1, 0, 0));
    });

    it("skips unfounded reports and emergency department reports", () => {
        expect(countsOsuIncident({ disposition: "Unfounded", location: "Ohio Union" })).toBe(false);
        expect(countsOsuIncident({ disposition: "Closed", location: "Emergency Department - OSU Main" })).toBe(false);
        expect(countsOsuIncident({ disposition: "Open - Arrest", location: "Ohio Union" })).toBe(true);
    });
});
