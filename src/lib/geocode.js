import { COVERAGE } from "../config.js";

/**
 * @typedef {Object} Place
 * @property {string} label
 * @property {number} lat
 * @property {number} lon
 */

/**
 * Looks up an address or place name with OpenStreetMap's Nominatim.
 * Its usage policy allows searches on submit, not autocomplete on every keystroke.
 * @returns {Promise<Place[]>}
 */
export async function searchPlaces(query, signal) {
    const params = new URLSearchParams({
        q: query,
        format: "jsonv2",
        limit: "5",
        viewbox: [COVERAGE.west, COVERAGE.south, COVERAGE.east, COVERAGE.north].join(","),
        bounded: "1",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal });
    if(!response.ok) throw new Error(`Search failed (${response.status})`);
    const results = await response.json();
    return results.map(result => ({
        label: result.display_name.split(", ").slice(0, 3).join(", "),
        lat: Number(result.lat),
        lon: Number(result.lon),
    }));
}
