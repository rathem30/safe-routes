// Pure helpers that turn incident records into routing weights.

// A report's weight halves for every year of age
export const HALF_LIFE_DAYS = 365;
// Reports older than this are not fetched; their weight would be at most a quarter of a new one
export const WINDOW_DAYS = 730;
// Reports whose weight decays below this are dropped
export const MIN_WEIGHT = 0.01;

const DAY_MS = 86400000;

/** Parses "8/1/2023 12:55:00 AM" as a local date, or returns null. */
export function parseOccurred(value) {
    const match = /^(\d+)\/(\d+)\/(\d+) (\d+):(\d+):(\d+) (AM|PM)$/.exec(value?.trim() ?? "");
    if(!match) return null;
    const [, month, day, year, hour, minute, second, meridiem] = match;
    const hours = (Number(hour) % 12) + (meridiem === "PM" ? 12 : 0);
    return new Date(Number(year), Number(month) - 1, Number(day), hours, Number(minute), Number(second));
}

/**
 * Scores offense text by the most severe category name it contains.
 * @param {Map<string, number>} categoryScores lower is more severe (Homicide 5 ... Fraud 70)
 * @returns {(text: string) => number | null}
 */
export function createTextScorer(categoryScores) {
    // Longest names first so "Motor Vehicle Theft" wins over "Theft"
    const names = [...categoryScores.keys()].sort((a, b) => b.length - a.length);
    return text => {
        let best = null;
        for(const part of text.split(";")) {
            const match = names.find(name => part.includes(name));
            if(match && (best === null || categoryScores.get(match) < best)) best = categoryScores.get(match);
        }
        return best;
    };
}

/** Maps a score of 5..70 to 0.90..0.09, squared to widen the gap between violent and petty crime. */
export function severity(score) {
    return ((100 - score) / 100) ** 2;
}

export function decay(ageDays) {
    return 0.5 ** (Math.max(0, ageDays) / HALF_LIFE_DAYS);
}

export function insideBounds({ south, west, north, east }, lat, lon) {
    return lat >= south && lat <= north && lon >= west && lon <= east;
}

/**
 * Converts scored incidents to [latitude, longitude, weight], decayed relative to now.
 * @param {{ lat: number, lon: number, occurred: Date, score: number }[]} incidents
 * @param {Date} now
 * @returns {number[][]}
 */
export function weighIncidents(incidents, now) {
    const crimes = [];
    for(const { lat, lon, occurred, score } of incidents) {
        const weight = severity(score) * decay((now - occurred) / DAY_MS);
        if(weight < MIN_WEIGHT) continue;
        crimes.push([+lat.toFixed(5), +lon.toFixed(5), +weight.toFixed(3)]);
    }
    return crimes;
}

/**
 * Normalizes OSU crime log rows and merges them into the archive, keyed by case number.
 * The public log only covers 60 days, so the archive is what keeps older incidents.
 * @param {Object<string, Object>} archive case number -> incident, updated in place
 * @param {Object[]} rows CSV rows
 * @param {Date} cutoff incidents that occurred before this are dropped
 * @returns {number} number of new cases
 */
export function mergeOsuLog(archive, rows, cutoff) {
    let added = 0;
    for(const row of rows) {
        const id = row["Case Number"]?.trim();
        const occurred = parseOccurred(row["Date/Time Occurrence Start"]) ?? parseOccurred(row["Date/Time Reported"]);
        if(!id || !occurred) continue;
        if(!archive[id]) added++;
        archive[id] = {
            occurred: occurred.toISOString(),
            location: row["General Location"].replace(/\s+/g, " ").trim(),
            offenses: row.Offenses.trim(),
            disposition: row.Disposition.trim(),
        };
    }
    for(const [id, incident] of Object.entries(archive)) {
        if(new Date(incident.occurred) < cutoff) delete archive[id];
    }
    return added;
}

/**
 * Whether an OSU incident should count toward street risk.
 * Unfounded reports did not happen, and emergency department reports are where victims were treated.
 */
export function countsOsuIncident(incident) {
    return !/unfounded/i.test(incident.disposition) && !/emergency department/i.test(incident.location);
}
