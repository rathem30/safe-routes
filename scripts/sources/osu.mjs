// Ohio State University Police daily crime log (Columbus campus), published under the Clery Act.
// The public log covers the last 60 days and names places instead of giving coordinates.

const LOG_CSV = "https://dataviz.rae.osu.edu/t/public/views/ColumbusCampusCrimeLog/ColumbusCampusCrimeLog.csv";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "safe-routes/1.0 (https://github.com/rathem30/safe-routes)";

// Ohio State's Columbus campus, the University District and OSU East Hospital; west, south, east, north.
// Searching only here avoids matching a same-named place elsewhere in Columbus
const CAMPUS = [-83.08, 39.965, -82.955, 40.035];

/** Minimal RFC 4180 CSV parser: quoted fields may contain commas, quotes and newlines. */
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for(let i = 0; i < text.length; i++) {
        const char = text[i];
        if(quoted) {
            if(char === "\"" && text[i + 1] === "\"") { field += "\""; i++; }
            else if(char === "\"") quoted = false;
            else field += char;
        }
        else if(char === "\"") quoted = true;
        else if(char === ",") { row.push(field); field = ""; }
        else if(char === "\n" || char === "\r") {
            if(char === "\r" && text[i + 1] === "\n") i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        }
        else field += char;
    }
    if(field || row.length) {
        row.push(field);
        rows.push(row);
    }
    const [header, ...records] = rows;
    return records
        .filter(record => record.length === header.length)
        .map(record => Object.fromEntries(header.map((name, i) => [name, record[i]])));
}

/** @returns {Promise<Object[]>} rows of the current 60-day log */
export async function fetchOsuLog() {
    const response = await fetch(LOG_CSV, { headers: { "User-Agent": USER_AGENT } });
    if(!response.ok) throw new Error(`OSU crime log request failed (${response.status})`);
    const rows = parseCsv(await response.text());
    if(rows.length === 0 || !("Case Number" in rows[0])) throw new Error("OSU crime log format changed");
    return rows;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function nominatim(query, viewbox) {
    const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "1", viewbox: viewbox.join(","), bounded: "1" });
    const response = await fetch(`${NOMINATIM}?${params}`, { headers: { "User-Agent": USER_AGENT } });
    // Nominatim allows one request per second
    await sleep(1100);
    if(!response.ok) throw new Error(`Geocoding failed (${response.status})`);
    const [result] = await response.json();
    return result ? [Number(result.lat), Number(result.lon)] : null;
}

/**
 * Simpler spellings of a log location to try in turn, for example
 * "Bike racks south of Torres House" -> "Torres House" and "Baker Hall - East" -> "Baker Hall".
 */
export function placeVariants(name) {
    const cleaned = name.replace(/\s+/g, " ").replace(/[.,]$/, "").trim();
    const variants = [cleaned];
    const add = value => {
        const trimmed = value.replace(/\s+/g, " ").replace(/[\s,/-]+$/, "").trim();
        if(trimmed.length > 2 && !variants.includes(trimmed)) variants.push(trimmed);
    };
    add(cleaned.replace(/^(bike|bicycle) racks? (north|south|east|west|near|by|at|outside)( of)? /i, ""));
    add(cleaned.replace(/\b((north|south|east|west) )?(bike|bicycle) racks?\b.*$/i, ""));
    add(cleaned.replace(/ (chapter house|bike racks?|parking lot|garage entrance)$/i, ""));
    add(cleaned.split(/ - | -|- /)[0]);
    for(const variant of [...variants]) {
        add(variant.replace(/\blab\b/i, "Laboratory").replace(/\blabs\b/i, "Laboratories"));
    }
    return variants;
}

/**
 * Looks up a campus place name, trying simpler spellings in turn.
 * @returns {Promise<[number, number] | null>}
 */
export async function geocodePlace(name) {
    for(const variant of placeVariants(name)) {
        const point = await nominatim(variant, CAMPUS);
        if(point) return point;
    }
    return null;
}
