import { describe, expect, it } from "vitest";
import { StreetGraph, graphFromStreets } from "../src/lib/graph.js";
import { edgeCost, findRoute } from "../src/lib/router.js";

/** Square grid of streets about 100 m apart with random risk per edge. */
function gridGraph(size, seed = 7) {
    let state = seed;
    const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
    const graph = new StreetGraph();
    for(let row = 0; row < size; row++) {
        for(let col = 0; col < size; col++) {
            graph.addNode(40 + row * 0.0009, -83 + col * 0.0012);
        }
    }
    for(let row = 0; row < size; row++) {
        for(let col = 0; col < size; col++) {
            const node = row * size + col;
            if(col + 1 < size) graph.addEdge(node, node + 1);
            if(row + 1 < size) graph.addEdge(node, node + size);
        }
    }
    for(let edge = 0; edge < graph.edgeCount; edge++) {
        graph.risk[edge] = random() < 0.2 ? random() * 20 : 0;
    }
    graph.labelComponents();
    return graph;
}

/** Plain Dijkstra used as the reference answer. */
function referenceCost(graph, start, end, safety) {
    const cost = new Array(graph.nodeCount).fill(Infinity);
    const done = new Array(graph.nodeCount).fill(false);
    cost[start] = 0;
    for(;;) {
        let node = -1;
        for(let i = 0; i < graph.nodeCount; i++) {
            if(!done[i] && cost[i] < Infinity && (node === -1 || cost[i] < cost[node])) node = i;
        }
        if(node === -1 || node === end) return cost[end];
        done[node] = true;
        for(const edge of graph.adjacency[node]) {
            const next = graph.otherEnd(edge, node);
            cost[next] = Math.min(cost[next], cost[node] + edgeCost(graph.length[edge], graph.risk[edge], safety));
        }
    }
}

function routeCost(graph, route, safety) {
    return route.edges.reduce((sum, edge) => sum + edgeCost(graph.length[edge], graph.risk[edge], safety), 0);
}

function routeLength(graph, route) {
    return route.edges.reduce((sum, edge) => sum + graph.length[edge], 0);
}

function routeExposure(graph, route) {
    return route.edges.reduce((sum, edge) => sum + graph.length[edge] * Math.log1p(graph.risk[edge]), 0);
}

describe("findRoute", () => {
    const graph = gridGraph(12);
    const pairs = [[0, 143], [5, 130], [17, 100], [60, 66]];

    it("finds the optimal route for every safety level", () => {
        for(const safety of [0, 0.5, 2, 5]) {
            for(const [start, end] of pairs) {
                const weight = Math.max(safety, 1e-6);
                const route = findRoute(graph, start, end, safety);
                expect(routeCost(graph, route, weight)).toBeCloseTo(referenceCost(graph, start, end, weight), 6);
            }
        }
    });

    it("returns a connected path from start to end", () => {
        const route = findRoute(graph, 0, 143, 3);
        expect(route.nodes[0]).toBe(0);
        expect(route.nodes.at(-1)).toBe(143);
        route.edges.forEach((edge, i) => {
            expect([graph.edgeA[edge], graph.edgeB[edge]].sort()).toEqual([route.nodes[i], route.nodes[i + 1]].sort());
        });
    });

    it("trades length for lower exposure as safety rises", () => {
        for(const [start, end] of pairs) {
            let previous = findRoute(graph, start, end, 0);
            for(const safety of [1, 2, 4, 8]) {
                const route = findRoute(graph, start, end, safety);
                expect(routeExposure(graph, route)).toBeLessThanOrEqual(routeExposure(graph, previous) + 1e-6);
                expect(routeLength(graph, route)).toBeGreaterThanOrEqual(routeLength(graph, previous) - 1e-6);
                previous = route;
            }
        }
    });

    it("returns null when the end is unreachable", () => {
        const split = new StreetGraph();
        const a = split.addNode(40, -83);
        const b = split.addNode(40.001, -83);
        const c = split.addNode(40.01, -83);
        const d = split.addNode(40.011, -83);
        split.addEdge(a, b);
        split.addEdge(c, d);
        expect(findRoute(split, a, d, 1)).toBeNull();
    });

    it("handles start equal to end", () => {
        expect(findRoute(graph, 10, 10, 1)).toEqual({ nodes: [10], edges: [] });
    });
});

describe("graphFromStreets", () => {
    // Two separate streets: a three-node one and a two-node one far to the north
    const graph = graphFromStreets({
        precision: 1e5,
        lat: [4000000, 100, 100, 4800, 100],
        lon: [-8300000, 0, 0, 0, 0],
        edges: [0, 1, 0, 1, 1, 1],
    });

    it("decodes delta-encoded nodes and edges", () => {
        expect(graph.nodeCount).toBe(5);
        expect(graph.lat).toEqual([40, 40.001, 40.002, 40.05, 40.051]);
        expect(graph.edgeCount).toBe(3);
        expect([graph.edgeA[2], graph.edgeB[2]]).toEqual([3, 4]);
    });

    it("snaps only onto the largest connected component", () => {
        const node = graph.nearestNode(40.05, -83);
        expect(graph.component[node]).toBe(graph.largestComponent);
        expect(graph.lat[node]).toBe(40.002);
    });
});
