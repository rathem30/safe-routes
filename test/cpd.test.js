import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCpdIncidents } from "../scripts/sources/cpd.mjs";

describe("fetchCpdIncidents", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("advances by the rows received when the server caps pages below the request", async () => {
        // 2,500 rows served 1,000 at a time
        const offsets = [];
        vi.stubGlobal("fetch", async url => {
            const offset = Number(new URL(url).searchParams.get("resultOffset"));
            offsets.push(offset);
            const count = Math.min(1000, 2500 - offset);
            const features = Array.from({ length: count }, (_, i) => ({
                attributes: { IncidentNo: String(offset + i), OccurredOn: 0, GeneralSubject: "Robbery" },
                geometry: { x: -83, y: 40 },
            }));
            return { ok: true, json: async () => ({ features, exceededTransferLimit: offset + count < 2500 }) };
        });
        const incidents = await fetchCpdIncidents({ south: 39, west: -84, north: 41, east: -82 }, new Date(0));
        expect(offsets).toEqual([0, 1000, 2000]);
        expect(new Set(incidents.map(incident => incident.id)).size).toBe(2500);
    });
});
