import { describe, expect, it } from "vitest";
import MinHeap from "../src/lib/MinHeap.js";

describe("MinHeap", () => {
    it("pops items in priority order", () => {
        const heap = new MinHeap();
        const priorities = Array.from({ length: 500 }, (_, i) => (i * 7919) % 1009);
        priorities.forEach(p => heap.push(`item${p}`, p));

        const popped = [];
        while(heap.size) {
            popped.push(heap.peekPriority());
            heap.pop();
        }
        expect(popped).toEqual([...priorities].sort((a, b) => a - b));
    });

    it("reports Infinity and undefined when empty", () => {
        const heap = new MinHeap();
        expect(heap.peekPriority()).toBe(Infinity);
        expect(heap.pop()).toBeUndefined();
    });
});
