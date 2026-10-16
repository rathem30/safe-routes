// Fetches the latest Columbus Police and Ohio State Police incidents and rebuilds
// public/crimes.json. Runs daily on GitHub Actions; run it locally with `npm run update:crimes`.

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { COVERAGE } from "../src/config.js";
import { boundsContain } from "../src/lib/geo.js";
import { fetchCpdIncidents } from "./sources/cpd.mjs";
import { fetchOsuLog, geocodePlace } from "./sources/osu.mjs";
import {
    HALF_LIFE_DAYS, WINDOW_DAYS, countsOsuIncident, createTextScorer, mergeOsuLog, weighIncidents,
} from "./crimeData.mjs";

const root = new URL("../", import.meta.url);
const path = name => new URL(name, root);
const OSU_ARCHIVE = "data/osu-incidents.json";
const OSU_PLACES = "scripts/data/osu_locations.tsv";
const OSU_ALIASES = "scripts/data/osu_place_aliases.tsv";
const CRIMES = "public/crimes.json";
const META = "public/crimes-meta.json";

async function readTsv(name) {
    const text = await readFile(path(name), "utf8");
    return text.trim().split(/\r?\n/).slice(1).map(line => line.split("\t"));
}

async function readJson(name, fallback) {
    try {
        return JSON.parse(await readFile(path(name), "utf8"));
    }
    catch {
        return fallback;
    }
}

const now = new Date();
const since = new Date(now - WINDOW_DAYS * 86400000);

// Columbus Police
const cpdScores = new Map((await readTsv("scripts/data/cpd_subject_severity.tsv")).map(([subject, score]) => [subject, Number(score)]));
const cpdRaw = await fetchCpdIncidents(COVERAGE, since);
const cpd = cpdRaw
    .filter(incident => cpdScores.has(incident.subject))
    .map(incident => ({ ...incident, score: cpdScores.get(incident.subject) }));

// Refuse to publish a much smaller dataset than last time, which points to a partial download
const previous = await readJson(META, null);
if(previous?.sources?.cpd?.count && cpd.length < previous.sources.cpd.count * 0.5) {
    throw new Error(`Only ${cpd.length} CPD incidents, down from ${previous.sources.cpd.count}. Keeping the old data.`);
}

// Ohio State Police
const archive = await readJson(OSU_ARCHIVE, {});
const knownCases = new Set(Object.keys(archive));
try {
    mergeOsuLog(archive, await fetchOsuLog(), since);
}
catch(error) {
    // The archive still has every earlier incident, so carry on without today's log
    console.warn(`OSU crime log unavailable, using the archive: ${error.message}`);
}

const places = new Map((await readTsv(OSU_PLACES).catch(() => [])).map(([name, lat, lon]) => [name, lat ? [Number(lat), Number(lon)] : null]));
// Pass --retry-unresolved to look up places that failed before, after improving the geocoder
const retry = process.argv.includes("--retry-unresolved");
const counted = Object.values(archive).filter(countsOsuIncident);
const unknownPlaces = [...new Set(counted.map(incident => incident.location))]
    .filter(name => !places.has(name) || (retry && places.get(name) === null));
// Misspelled or vague names map to a searchable name in osu_place_aliases.tsv
const aliases = new Map(await readTsv(OSU_ALIASES));
for(const name of unknownPlaces) {
    const alias = aliases.get(name);
    try {
        places.set(name, alias && places.get(alias) ? places.get(alias) : await geocodePlace(alias ?? name));
    }
    catch(error) {
        // Left out of the cache so it is retried tomorrow; one failed lookup must not block the CPD refresh
        console.warn(`Could not geocode "${name}": ${error.message}`);
    }
}

const scoreText = createTextScorer(new Map((await readTsv("scripts/data/category_severity.tsv")).map(([name, score]) => [name, Number(score)])));
const osu = [];
for(const incident of counted) {
    const point = places.get(incident.location);
    const score = scoreText(incident.offenses);
    if(!point || score === null) continue;
    osu.push({ lat: point[0], lon: point[1], occurred: new Date(incident.occurred), score });
}

const inCoverage = incident => boundsContain(COVERAGE, incident);
const crimes = weighIncidents([...cpd, ...osu].filter(inCoverage), now);

const newest = list => list.reduce((latest, incident) => incident.occurred > latest ? incident.occurred : latest, new Date(0)).toISOString().slice(0, 10);
const meta = {
    updated: now.toISOString(),
    halfLifeDays: HALF_LIFE_DAYS,
    windowDays: WINDOW_DAYS,
    sources: {
        cpd: { name: "Columbus Division of Police", count: cpd.length, newest: newest(cpd) },
        osu: { name: "Ohio State University Police", count: osu.length, newest: newest(osu) },
    },
};

// Sorted keys and one incident per line keep daily diffs readable
const sortedArchive = Object.fromEntries(Object.entries(archive).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(path(OSU_ARCHIVE), `{\n${Object.entries(sortedArchive).map(([id, incident]) => `${JSON.stringify(id)}:${JSON.stringify(incident)}`).join(",\n")}\n}\n`);
const placeRows = [...places].sort(([a], [b]) => a.localeCompare(b)).map(([name, point]) => [name, point?.[0] ?? "", point?.[1] ?? ""].join("\t"));
await writeFile(path(OSU_PLACES), ["Location\tLatitude\tLongitude", ...placeRows].join("\n") + "\n");
await writeFile(path(CRIMES), JSON.stringify({ updated: meta.updated, halfLifeDays: HALF_LIFE_DAYS, crimes }));
await writeFile(path(META), JSON.stringify(meta, null, 2) + "\n");

const osuAdded = Object.keys(archive).filter(id => !knownCases.has(id)).length;
const unresolved = new Set(counted.filter(incident => !places.get(incident.location)).map(incident => incident.location)).size;
console.log(`CPD: ${cpdRaw.length} incidents, ${cpd.length} scored`);
console.log(`OSU: ${Object.keys(archive).length} archived (${osuAdded} new), ${osu.length} scored, ${unknownPlaces.length} places looked up, ${unresolved} places still unresolved`);
console.log(`${crimes.length} weighted reports written to ${CRIMES}`);
