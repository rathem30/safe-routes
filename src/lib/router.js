import MinHeap from "./MinHeap.js";
import { distanceMeters } from "./geo.js";

// Breaks ties between equally short routes in favour of the safer one,
// so the "shortest" route is the fairest possible baseline.
const TIE_BREAK = 1e-6;

/**
 * Edge cost: length * (1 + safety * ln(1 + risk)).
 * The log stops a single address with dozens of reports from making a whole block
 * impassable. Cost is never below length, so straight-line distance stays an
 * admissible A* heuristic and the route found is optimal.
 */
export function edgeCost(length, risk, safety) {
    return length * (1 + safety * Math.log1p(risk));
}

/**
 * A* from start to end.
 * @param {import("./graph.js").StreetGraph} graph
 * @returns {{ nodes: number[], edges: number[] } | null} null when unreachable
 */
export function findRoute(graph, start, end, safety) {
    const weight = Math.max(safety, TIE_BREAK);
    const n = graph.nodeCount;
    const cost = new Float64Array(n).fill(Infinity);
    const viaEdge = new Int32Array(n).fill(-1);
    const settled = new Uint8Array(n);
    const endLat = graph.lat[end];
    const endLon = graph.lon[end];
    const heuristic = node => distanceMeters(graph.lat[node], graph.lon[node], endLat, endLon);

    const heap = new MinHeap();
    cost[start] = 0;
    heap.push(start, heuristic(start));

    while(heap.size) {
        const node = heap.pop();
        if(settled[node]) continue;
        settled[node] = 1;
        if(node === end) break;

        for(const edge of graph.adjacency[node]) {
            const next = graph.otherEnd(edge, node);
            if(settled[next]) continue;
            const nextCost = cost[node] + edgeCost(graph.length[edge], graph.risk[edge], weight);
            if(nextCost >= cost[next]) continue;
            cost[next] = nextCost;
            viaEdge[next] = edge;
            heap.push(next, nextCost + heuristic(next));
        }
    }

    if(!settled[end]) return null;
    const nodes = [end];
    const edges = [];
    for(let node = end; node !== start;) {
        const edge = viaEdge[node];
        edges.push(edge);
        node = graph.otherEnd(edge, node);
        nodes.push(node);
    }
    return { nodes: nodes.reverse(), edges: edges.reverse() };
}

/**
 * @param {import("./graph.js").StreetGraph} graph
 * @param {{ nodes: number[], edges: number[] }} route
 * @returns {{ length: number, exposure: number }} length in meters; exposure is the sum of
 *   length * ln(1 + risk), the risk term the router minimizes
 */
export function routeStats(graph, route) {
    let length = 0;
    let exposure = 0;
    for(const edge of route.edges) {
        length += graph.length[edge];
        exposure += graph.length[edge] * Math.log1p(graph.risk[edge]);
    }
    return { length, exposure };
}

/** Route as [longitude, latitude] pairs for GeoJSON. */
export function routeCoordinates(graph, route) {
    return route.nodes.map(node => [graph.lon[node], graph.lat[node]]);
}
