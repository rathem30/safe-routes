/**
 * Binary min-heap of items ordered by a numeric priority.
 * Stale entries are not removed; callers skip them when popped (lazy deletion).
 */
export default class MinHeap {
    constructor() {
        this.items = [];
        this.priorities = [];
    }

    get size() {
        return this.items.length;
    }

    /**
     * @returns {Number} lowest priority, or Infinity when empty
     */
    peekPriority() {
        return this.items.length ? this.priorities[0] : Infinity;
    }

    push(item, priority) {
        const items = this.items;
        const priorities = this.priorities;
        let i = items.length;
        items.push(item);
        priorities.push(priority);

        while(i > 0) {
            const parent = (i - 1) >> 1;
            if(priorities[parent] <= priority) break;
            items[i] = items[parent];
            priorities[i] = priorities[parent];
            i = parent;
        }
        items[i] = item;
        priorities[i] = priority;
    }

    pop() {
        const items = this.items;
        const priorities = this.priorities;
        if(items.length === 0) return undefined;

        const top = items[0];
        const lastItem = items.pop();
        const lastPriority = priorities.pop();
        const length = items.length;
        if(length === 0) return top;

        let i = 0;
        for(;;) {
            let child = 2 * i + 1;
            if(child >= length) break;
            if(child + 1 < length && priorities[child + 1] < priorities[child]) child++;
            if(priorities[child] >= lastPriority) break;
            items[i] = items[child];
            priorities[i] = priorities[child];
            i = child;
        }
        items[i] = lastItem;
        priorities[i] = lastPriority;
        return top;
    }
}
