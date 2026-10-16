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

/**
 * Short description of the street at a point, such as "1739 North High Street".
 * @returns {Promise<string | null>}
 */
export async function describePoint(lat, lon) {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon), format: "jsonv2", zoom: "18" });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
    if(!response.ok) return null;
    const { name, address } = await response.json();
    if(!address) return null;
    const street = [address.house_number, address.road ?? address.pedestrian ?? address.footway].filter(Boolean).join(" ");
    return name || street || null;
}
