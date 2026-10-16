# How risk is calculated

This document explains, step by step, how Safe Routes turns police reports into a "safer" walking route, with the formulas, the reasoning behind each choice, worked examples and the limits of the approach. Every number here matches the code; the relevant file is named in each section.

The pipeline has five stages:

1. **Collect** incidents from two police sources.
2. **Weigh** each incident by how severe and how recent it is.
3. **Spread** each incident's weight over the streets around it.
4. **Price** every street segment by combining its length with its risk.
5. **Route** with A\* over those prices, then **compare** the result with the shortest route.

---

## 1. Collecting incidents

`scripts/update-crimes.mjs`, `scripts/sources/`

A GitHub Action runs every morning at 6 a.m. Eastern, rebuilds `public/crimes.json` and redeploys the site. It uses incidents from the last **two years** (`WINDOW_DAYS = 730`).

### Columbus Division of Police

Source: the City of Columbus open data service (ArcGIS feature service `Police_Incident_Reports`). Every incident has a point location, published at block level ("1100 Block of Rhoads Ave"), plus an occurrence time and a subject such as "Robbery" or "Lost Property".

Only incidents inside the app's coverage area are requested. In the October 2026 build, that was **98,830 incidents**, of which **64,081 were scored**.

The difference is incidents whose subject is not a crime against people or property. Subjects are scored only if they appear in `scripts/data/cpd_subject_severity.tsv`. Everything else is skipped, including:

- accidents, overdoses, suicides, drownings and missing persons;
- lost property and found firearms;
- warrants served for other agencies and traffic arrests;
- drug and liquor offenses, which have no victim on the street.

### Ohio State University Police

Source: the Columbus-campus daily crime log that OSU publishes under the Clery Act, exported as CSV from OSU's public Tableau dashboard. Two quirks shape how it is handled:

- **It only covers 60 days.** Every incident is saved to `data/osu-incidents.json`, keyed by case number, so history accumulates past that window. Re-fetching a case updates it in place, for example when its disposition changes.
- **It names places, not coordinates** ("Morrill Tower", "18th Ave Library", "N High St and E 16th Ave"). Each name is geocoded once with OpenStreetMap's Nominatim and cached in `scripts/data/osu_locations.tsv`. The search is limited to the campus area so a name cannot match a same-named place elsewhere in Columbus. If a name fails, simpler variants are tried ("Busch House South Bike Rack" → "Busch House"). Known misspellings are mapped in `scripts/data/osu_place_aliases.tsv`.

OSU incidents are skipped when:

- the disposition is **Unfounded** (the crime did not happen);
- the location is an **emergency department**, because that is where victims were treated, not where the crime occurred;
- the place could not be located (intersections and vague entries such as "Off Campus" mostly);
- none of the offenses has a severity score (underage drinking, drug possession, traffic violations).

In the October 2026 build, **419 OSU incidents** were scored.

---

## 2. Weighing each incident

`scripts/crimeData.mjs`

Every scored incident becomes a single number, its **weight**, between 0 and about 0.9:

```
weight = severity × recency
```

### Severity

Each crime type has a **score** from 5 (most severe) to 70 (least), in the TSV files in `scripts/data/`. The score converts to a severity:

```
severity = ((100 − score) / 100)²
```

| Crime | Score | Severity |
|---|---:|---:|
| Homicide | 5 | 0.90 |
| Robbery, rape | 10 | 0.81 |
| Assault, burglary | 15 | 0.72 |
| Domestic violence | 20 | 0.64 |
| Menacing, stalking, weapons offense | 25 | 0.56 |
| Theft | 30 | 0.49 |
| Motor vehicle theft, criminal damaging | 35 | 0.42 |
| Trespassing | 50 | 0.25 |
| Disorderly conduct | 60 | 0.16 |
| Telecommunication harassment | 65 | 0.12 |

**Why square it?** On a linear scale a robbery would count only 1.8 times as much as trespassing (0.90 against 0.50). Squaring stretches the gap to 3.2 times (0.81 against 0.25), which better matches how differently a pedestrian should treat them.

When an OSU entry lists several offenses, the most severe one counts.

### Recency

A report loses half its weight for every year since it occurred, measured from the day the data was built:

```
recency = 0.5 ^ (age in days / 365)
```

| Age | Recency |
|---|---:|
| Today | 1.00 |
| 6 months | 0.71 |
| 1 year | 0.50 |
| 2 years | 0.25 |

Patterns persist for a while, but a block that had trouble two years ago may not have it now. A half-life lets old reports fade gradually instead of falling off a cliff. Reports whose weight falls below 0.01 are dropped.

Each report is published as just `[latitude, longitude, weight]`, rounded to 5 decimal places (about 1 m).

---

## 3. Spreading weight onto streets

`src/lib/CrimeIndex.js`, `src/lib/graph.js`

### Risk at a point

A report affects every point within **100 m** of it (`CRIME_RADIUS_METERS`), fading linearly from full weight at the report's location to zero at 100 m:

```
risk(point) = Σ over reports within 100 m of:  weight × (1 − distance / 100)
```

Linear falloff is deliberate: a report across the street matters almost fully, one at the end of the block barely at all, and there is no hard edge where risk suddenly jumps.

**Worked example.** A point on a sidewalk has three reports nearby:

| Report | Weight | Distance | Contribution |
|---|---:|---:|---:|
| Robbery, 6 months ago | 0.81 × 0.71 = 0.573 | 40 m | 0.573 × 0.6 = **0.344** |
| Theft, 1 week ago | 0.49 × 0.99 = 0.484 | 90 m | 0.484 × 0.1 = **0.048** |
| Assault, 18 months ago | 0.72 × 0.35 = 0.255 | 10 m | 0.255 × 0.9 = **0.230** |

The risk at that point is **0.62**.

Finding the reports within 100 m of a point uses a spatial grid whose cells are 100 m wide. Only the point's own cell and its 8 neighbors are checked, so a lookup touches dozens of reports instead of all 64,000.

### Risk of a street segment

The street network has about 226,000 segments, each running between two consecutive points of an OpenStreetMap way. A segment's risk is the **average** risk at points sampled every **25 m** along it (`RISK_SAMPLE_SPACING_METERS`), taken at the middle of each 25 m stretch. A 100 m segment is sampled at 12.5, 37.5, 62.5 and 87.5 m.

Averaging means a segment's risk does not depend on how OpenStreetMap happened to split the street: the same 100 m of sidewalk scores the same whether it is one segment or four.

All of this runs in the browser when the app loads, in about 0.3 seconds.

---

## 4. Pricing each segment

`src/lib/router.js`, `src/config.js`

The router does not minimize distance. It minimizes a **cost** that inflates each segment's length by its risk:

```
cost = length × (1 + λ × ln(1 + risk))
```

**λ (lambda)** is how much you care about safety. It comes from the *Route preference* slider: λ = slider × 0.3, so the slider runs from 0 to 3, and the default position 4 gives **λ = 1.2**. At λ = 0 the cost is the length, and the route is the plain shortest one.

**Worked example** at the default λ = 1.2, for three 100 m segments:

| Segment | Risk | ln(1 + risk) | Multiplier | Cost |
|---|---:|---:|---:|---:|
| Quiet residential street | 0 | 0 | 1.00 | 100 m |
| The sidewalk from the example above | 0.62 | 0.48 | 1.58 | 158 m |
| Busy commercial strip | 8 | 2.20 | 3.64 | 364 m |

The router treats 100 m of the busy strip like 364 m of quiet street. It will walk up to 3.6 times as far on quiet streets to avoid it, but no further.

### Why the logarithm?

A handful of addresses, such as a big-box store that reports every shoplifting incident, collect dozens of reports. With cost proportional to raw risk, those blocks would become effectively impassable and the router would make absurd detours. The logarithm gives diminishing returns: a segment with risk 80 costs only about twice as much as one with risk 8 (ln 81 ≈ 4.4 against ln 9 ≈ 2.2), not ten times as much. The `1 +` keeps the cost at zero extra for risk 0 and avoids the logarithm of zero.

### Why the route is optimal

Because `1 + λ × ln(1 + risk)` is never below 1, a segment's cost is never below its length. The A\* search uses straight-line distance to the destination as its estimate of remaining cost, and straight-line distance never exceeds the real cost of getting there, so the estimate never overestimates. That makes the A\* result **provably the lowest-cost route** for the chosen λ, not an approximation. The unit tests check this against a brute-force Dijkstra search on random grids.

### Breaking ties fairly

At λ = 0, many routes can be exactly equally short. So that the comparison route is the fairest possible baseline, the shortest route is computed with a tiny λ of 0.000001: among routes of equal length, it picks the one with the least risk.

---

## 5. Comparing with the shortest route

`src/lib/planner.js`, `src/lib/router.js`

For every request, the router runs twice from the same start and end points: once with your λ and once for the shortest route. Both routes are scored the same way:

- **Crime exposure** = Σ length × ln(1 + risk) over the route's segments. This is the risk part of the cost, without λ, so it measures exactly what the router is trying to avoid. *"62% less crime exposure"* means the safer route's exposure is 38% of the shortest route's.
- **Reports nearby** = the number of distinct reports within 100 m of any point along the route, sampled every 25 m. It is easier to grasp than exposure, though it ignores severity and recency.
- **Walk time** assumes 80 m per minute (about 4.8 km/h).

When both routes come out identical, the app says so instead of claiming an improvement.

---

## Tuning the safety scale

The slider's scale was set by routing 60 random trips of 1–5 km across the coverage area at several values of λ:

| λ | Median detour | 90th-percentile detour | Median exposure cut |
|---:|---:|---:|---:|
| 0.5 | 1% | 8% | 29% |
| 1 | 4% | 18% | 39% |
| 1.5 | 6% | 29% | 45% |
| 2 | 12% | 39% | 49% |
| 3 | 15% | 41% | 51% |
| 5 | 17% | 51% | 52% |

Exposure falls quickly at first and then levels off: above λ ≈ 2 the router mostly adds distance without avoiding much more. So the slider stops at λ = 3, and the default of 1.2 sits near the knee of the curve. There it costs a median of about 5% extra distance for about 40% less exposure.

---

## Parameters

| Parameter | Value | File |
|---|---|---|
| Data window | 730 days | `scripts/crimeData.mjs` |
| Recency half-life | 365 days | `scripts/crimeData.mjs` |
| Minimum weight kept | 0.01 | `scripts/crimeData.mjs` |
| Severity scores, CPD | per subject | `scripts/data/cpd_subject_severity.tsv` |
| Severity scores, OSU | per offense name | `scripts/data/category_severity.tsv` |
| Influence radius | 100 m | `src/config.js` |
| Sample spacing | 25 m | `src/config.js` |
| λ per slider step | 0.3 | `src/config.js` |
| Default slider position | 4 (λ = 1.2) | `src/config.js` |
| Walking pace | 80 m/min | `src/config.js` |

---

## Limitations

Read the routes with these in mind:

- **Reported crime is not the same as danger.** Reports concentrate where police patrol most and where businesses report every incident. Routing around reports can mean routing around lower-income neighborhoods and communities of color, which raises fairness concerns of its own. Treat the result as one input, not a safety rating.
- **Locations are approximate.** CPD publishes block-level points, and OSU incidents are placed at the building they name. A report inside a building counts as risk on the streets around it.
- **Time of day is ignored.** A street with daytime thefts counts the same at 2 a.m., and lighting and foot traffic are not considered.
- **Severity scores are judgment calls.** They are a reasonable ordering, not a measured truth, and they are easy to change in the TSV files.
- **The data lags.** CPD typically runs a few days behind, and OSU about a day.
- **Some OSU incidents are left out.** Intersections and vague place names cannot always be located; these can be fixed by hand in `scripts/data/osu_locations.tsv`.
- **Coverage is central Columbus only**, the area outlined on the map.
