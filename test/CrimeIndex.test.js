import { describe, expect, it } from "vitest";
import { CrimeIndex } from "../src/lib/CrimeIndex.js";
import { distanceMeters } from "../src/lib/geo.js";

function randomCrimes(count, seed = 1) {
    let state = seed;
    const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
    return Array.from({ length: count }, () => [39.95 + random() * 0.03, -83.01 + random() * 0.03, random()]);
}

describe("CrimeIndex", () => {
    const crimes = randomCrimes(3000);
    const index = new CrimeIndex(crimes, 100);

    it("finds exactly the crimes a brute-force search finds", () => {
        for(const [lat, lon] of [[39.96, -83.0], [39.951, -82.985], [39.979, -83.009]]) {
            const found = [];
            index.forEachNear(lat, lon, i => found.push(i));
            const expected = crimes
                .map((crime, i) => [i, distanceMeters(lat, lon, crime[0], crime[1])])
                .filter(([, distance]) => distance <= 100)
                .map(([i]) => i);
            expect(found.sort((a, b) => a - b)).toEqual(expected);
        }
    });

    it("weights risk by distance", () => {
        const single = new CrimeIndex([[40, -83, 1]], 100);
        expect(single.riskAt(40, -83)).toBeCloseTo(1);
        expect(single.riskAt(40 + 50 / 111195, -83)).toBeCloseTo(0.5);
        expect(single.riskAt(40 + 150 / 111195, -83)).toBe(0);
    });
});
