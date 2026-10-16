import { distanceMeters } from "./geo.js";

/**
 * Street network stored in flat arrays, which keeps routing fast on graphs
 * with tens of thousands of nodes.
 *
 * Nodes are indexed 0..n-1, edges 0..m-1. Every edge is walkable both ways.
 */
export class StreetGraph {
    constructor() {
        this.lat = [];
        this.lon = [];
        this.edgeA = [];
        this.edgeB = [];
        this.length = [];
        this.risk = [];
        this.adjacency = [];
        this.component = null;
        this.largestComponent = -1;
    }

    get nodeCount() {
        return this.lat.length;
    }

    get edgeCount() {
        return this.edgeA.length;
    }

    addNode(lat, lon) {
        this.lat.push(lat);
        this.lon.push(lon);
        this.adjacency.push([]);
        return this.lat.length - 1;
    }

    addEdge(a, b) {
        if(a === b) return -1;
        const edge = this.edgeA.length;
        this.edgeA.push(a);
        this.edgeB.push(b);
        this.length.push(distanceMeters(this.lat[a], this.lon[a], this.lat[b], this.lon[b]));
        this.risk.push(0);
        this.adjacency[a].push(edge);
        this.adjacency[b].push(edge);
        return edge;
    }

    otherEnd(edge, node) {
        return this.edgeA[edge] === node ? this.edgeB[edge] : this.edgeA[edge];
    }

    /**
     * Labels connected components. Clipping the map to a bounding box leaves small
     * islands of footpaths, and snapping a point onto one would make routing fail.
     */
    labelComponents() {
        const component = new Int32Array(this.nodeCount).fill(-1);
        const sizes = [];
        const stack = [];
        for(let start = 0; start < this.nodeCount; start++) {
            if(component[start] !== -1 || this.adjacency[start].length === 0) continue;
            const id = sizes.length;
            let size = 0;
            component[start] = id;
            stack.push(start);
            while(stack.length) {
                const node = stack.pop();
                size++;
                for(const edge of this.adjacency[node]) {
                    const next = this.otherEnd(edge, node);
                    if(component[next] === -1) {
                        component[next] = id;
                        stack.push(next);
                    }
                }
            }
            sizes.push(size);
        }
        this.component = component;
        this.largestComponent = sizes.indexOf(Math.max(...sizes));
    }

    /** Closest node on the main street network, or -1 if the graph is empty. */
    nearestNode(lat, lon) {
        if(!this.component) this.labelComponents();
        let best = -1;
        let bestDistance = Infinity;
        for(let node = 0; node < this.nodeCount; node++) {
            if(this.component[node] !== this.largestComponent) continue;
            const distance = distanceMeters(lat, lon, this.lat[node], this.lon[node]);
            if(distance < bestDistance) {
                best = node;
                bestDistance = distance;
            }
        }
        return best;
    }

    /**
     * Measures average crime density along every edge by sampling points along it.
     * @param {import("./CrimeIndex.js").CrimeIndex} crimeIndex
     * @param {number} spacing meters between samples
     */
    applyRisk(crimeIndex, spacing) {
        for(let edge = 0; edge < this.edgeCount; edge++) {
            const a = this.edgeA[edge];
            const b = this.edgeB[edge];
            const samples = Math.max(1, Math.ceil(this.length[edge] / spacing));
            let risk = 0;
            for(let i = 0; i < samples; i++) {
                const t = (i + 0.5) / samples;
                risk += crimeIndex.riskAt(
                    this.lat[a] + (this.lat[b] - this.lat[a]) * t,
                    this.lon[a] + (this.lon[b] - this.lon[a]) * t,
                );
            }
            this.risk[edge] = risk / samples;
        }
    }
}

function undelta(values) {
    const result = new Array(values.length);
    let last = 0;
    for(let i = 0; i < values.length; i++) {
        last += values[i];
        result[i] = last;
    }
    return result;
}

/**
 * Builds a graph from the street file written by scripts/build-streets.py:
 * delta-encoded integer coordinates and a flat, delta-encoded list of edge endpoints.
 */
export function graphFromStreets({ precision, lat, lon, edges }) {
    const graph = new StreetGraph();
    const lats = undelta(lat);
    const lons = undelta(lon);
    for(let i = 0; i < lats.length; i++) {
        graph.addNode(lats[i] / precision, lons[i] / precision);
    }
    const ends = undelta(edges);
    for(let i = 0; i < ends.length; i += 2) {
        graph.addEdge(ends[i], ends[i + 1]);
    }
    graph.labelComponents();
    return graph;
}
