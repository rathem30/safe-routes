import { CrimeIndex } from "./CrimeIndex.js";
import { graphFromStreets } from "./graph.js";
import { findRoute, routeCoordinates, routeStats } from "./router.js";
import { boundsContain } from "./geo.js";
import { CRIME_RADIUS_METERS, RISK_SAMPLE_SPACING_METERS, SAFETY_WEIGHT_PER_STEP } from "../config.js";

/**
 * Plans safe and shortest walking routes over the prebuilt street network.
 * The network and crime data load once; every later request only runs the router.
 */
export class Planner {
    /**
     * @param {{ loadStreets: () => Promise<Object>, loadCrimes: () => Promise<number[][]> }} sources
     */
    constructor({ loadStreets, loadCrimes }) {
        this.loadStreets = loadStreets;
        this.loadCrimes = loadCrimes;
        this.network = null;
    }

    /** Loads streets and crimes and scores every street. Retries after a failure. */
    load() {
        this.network ??= Promise.all([this.loadStreets(), this.loadCrimes()])
            .then(([streets, crimes]) => {
                const graph = graphFromStreets(streets);
                const crimeIndex = new CrimeIndex(crimes, CRIME_RADIUS_METERS);
                graph.applyRisk(crimeIndex, RISK_SAMPLE_SPACING_METERS);
                return { graph, crimeIndex, bounds: streets.bounds };
            })
            .catch(error => {
                this.network = null;
                throw error;
            });
        return this.network;
    }

    /**
     * @param {{ lat: number, lon: number }} from
     * @param {{ lat: number, lon: number }} to
     * @param {number} safety slider value, 0-10
     */
    async plan(from, to, safety) {
        const { graph, crimeIndex, bounds } = await this.load();
        if(!boundsContain(bounds, from) || !boundsContain(bounds, to)) {
            throw new PlanError("Safe Routes covers central Columbus only. Pick points inside the outlined area.");
        }

        const start = graph.nearestNode(from.lat, from.lon);
        const end = graph.nearestNode(to.lat, to.lon);
        if(start === end) throw new PlanError("Start and destination are the same spot. Move one of them.");
        const safe = findRoute(graph, start, end, safety * SAFETY_WEIGHT_PER_STEP);
        const shortest = findRoute(graph, start, end, 0);
        if(!safe || !shortest) throw new PlanError("No walking route connects these points.");

        const describe = route => ({
            coordinates: routeCoordinates(graph, route),
            ...routeStats(graph, route, crimeIndex, RISK_SAMPLE_SPACING_METERS),
        });

        return {
            safe: describe(safe),
            shortest: describe(shortest),
            sameRoute: safe.edges.length === shortest.edges.length && safe.edges.every((edge, i) => edge === shortest.edges[i]),
        };
    }
}

/** An error whose message is fit to show to the user. */
export class PlanError extends Error {}
