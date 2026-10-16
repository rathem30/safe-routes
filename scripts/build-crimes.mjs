// Builds public/crimes.json from a raw Columbus Police export.
//
// The raw export contains victim names, addresses and narratives, so it lives in
// data/raw/ (gitignored). The output keeps only [latitude, longitude, weight].
//
// Usage: npm run build:crimes -- [input.json] [output.json]

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { buildCrimes, createOffenseScorer } from "./crimeData.mjs";

const input = process.argv[2] ?? "data/raw/updated_crimes.json";
const output = process.argv[3] ?? "public/crimes.json";

async function readTsv(name) {
    const text = await readFile(new URL(`./data/${name}`, import.meta.url), "utf8");
    return text.trim().split(/\r?\n/).slice(1).map(line => line.split("\t"));
}

const offenseToCategory = new Map(await readTsv("offense_categories.tsv"));
const categoryScores = new Map((await readTsv("category_severity.tsv")).map(([name, score]) => [name, Number(score)]));
const rows = JSON.parse(await readFile(input, "utf8"));

const result = buildCrimes(rows, createOffenseScorer(offenseToCategory, categoryScores));
await writeFile(output, JSON.stringify(result.output));

console.log(`${rows.length} rows -> ${result.reportCount} reports -> ${result.output.crimes.length} crimes written to ${output}`);
console.log(`Skipped ${result.unscored} rows with no recognised offense and ${result.outside} geocoded outside Columbus`);
console.log(`Data through ${result.output.referenceDate}`);
