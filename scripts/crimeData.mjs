// Pure helpers for turning a raw Columbus Police export into routing weights.

// A report's weight halves for every year it is older than the newest report
export const HALF_LIFE_DAYS = 365;
// Reports whose weight decays below this are dropped
export const MIN_WEIGHT = 0.01;
// Franklin County, OH. Some reports are geocoded to the wrong city or country
export const AREA = { south: 39.75, west: -83.3, north: 40.2, east: -82.7 };

/** Parses "8/1/2023 12:55:00 AM" as a local date, or returns null. */
export function parseOccurred(value) {
    const match = /^(\d+)\/(\d+)\/(\d+) (\d+):(\d+):(\d+) (AM|PM)$/.exec(value ?? "");
    if(!match) return null;
    const [, month, day, year, hour, minute, second, meridiem] = match;
    const hours = (Number(hour) % 12) + (meridiem === "PM" ? 12 : 0);
    return new Date(Number(year), Number(month) - 1, Number(day), hours, Number(minute), Number(second));
}

/**
 * Parses a Python-style list string: "['291102.12 - Robbery', '...']".
 * Descriptions can contain commas, so this matches quoted items instead of splitting.
 */
export function parseList(value) {
    return [...(value ?? "").matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)].map(m => m[1] ?? m[2]);
}

/** [latitude, longitude] from either Latitude/Longitude fields or a "lon, lat" Coordinates string. */
export function parseCoordinates(row) {
    if(row.Latitude != null && row.Longitude != null) {
        return [Number(row.Latitude), Number(row.Longitude)];
    }
    const [lon, lat] = String(row.Coordinates ?? "").split(",").map(Number);
    return [lat, lon];
}

/**
 * @param {Map<string, string>} offenseToCategory
 * @param {Map<string, number>} categoryScores lower is more severe (Murder 5 ... Embezzlement 70)
 * @returns {(offense: string) => number | null}
 */
export function createOffenseScorer(offenseToCategory, categoryScores) {
    // Longest names first so "Motor Vehicle Theft" wins over "Theft"
    const categoryNames = [...categoryScores.keys()].sort((a, b) => b.length - a.length);
    return offense => {
        const category = offenseToCategory.get(offense);
        if(category && categoryScores.has(category)) return categoryScores.get(category);

        // Fall back to finding a category name inside "<code> - <name> _ <detail>"
        const name = offense.split(" - ").slice(1).join(" - ").split(" _ ")[0];
        const match = categoryNames.find(c => name.includes(c));
        return match ? categoryScores.get(match) : null;
    };
}

/** Maps a category score of 5..70 to 0.90..0.09, squared to widen the gap between violent and petty crime. */
export function severity(score) {
    return ((100 - score) / 100) ** 2;
}

export function decay(ageDays) {
    return 0.5 ** (ageDays / HALF_LIFE_DAYS);
}

function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Reduces raw export rows to the minimum the router needs. No names, addresses or narratives survive.
 * @returns {{ output: { referenceDate: string, halfLifeDays: number, crimes: number[][] }, reportCount: number, unscored: number, outside: number }}
 */
export function buildCrimes(rows, scoreOffense) {
    // The export has one row per offense or victim, so merge rows by report number
    const reports = new Map();
    let unscored = 0;
    let outside = 0;
    for(const row of rows) {
        const occurred = parseOccurred(row.Occurred);
        const [lat, lon] = parseCoordinates(row);
        if(!occurred || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        if(lat < AREA.south || lat > AREA.north || lon < AREA.west || lon > AREA.east) {
            outside++;
            continue;
        }

        const scores = parseList(row["Offense Descriptions"]).map(scoreOffense).filter(s => s != null);
        if(scores.length === 0) {
            unscored++;
            continue;
        }

        const key = row["Report Number"] ?? row.URL;
        const score = Math.min(...scores);
        const existing = reports.get(key);
        if(!existing || score < existing.score) {
            reports.set(key, { lat, lon, occurred, score });
        }
    }

    let newest = -Infinity;
    for(const report of reports.values()) newest = Math.max(newest, report.occurred.getTime());

    const crimes = [];
    for(const { lat, lon, occurred, score } of reports.values()) {
        const weight = severity(score) * decay((newest - occurred.getTime()) / 86400000);
        if(weight < MIN_WEIGHT) continue;
        crimes.push([+lat.toFixed(5), +lon.toFixed(5), +weight.toFixed(3)]);
    }

    return {
        output: { referenceDate: reports.size ? isoDate(new Date(newest)) : null, halfLifeDays: HALF_LIFE_DAYS, crimes },
        reportCount: reports.size,
        unscored,
        outside,
    };
}
