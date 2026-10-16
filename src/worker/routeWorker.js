import { Planner, PlanError } from "../lib/planner.js";

async function fetchJson(url) {
    const response = await fetch(url);
    if(!response.ok) throw new Error(`Request for ${url} failed (${response.status})`);
    return response.json();
}

let urls = null;

const planner = new Planner({
    loadStreets: () => fetchJson(urls.streets),
    loadCrimes: () => fetchJson(urls.crimes).then(data => data.crimes),
});

self.onmessage = async ({ data }) => {
    urls = data.urls;
    if(data.type === "preload") {
        planner.load().catch(() => {});
        return;
    }
    try {
        const result = await planner.plan(data.from, data.to, data.safety);
        self.postMessage({ id: data.id, result });
    }
    catch(error) {
        console.error(error);
        const message = error instanceof PlanError
            ? error.message
            : "Could not load the street data. Check your connection and try again.";
        self.postMessage({ id: data.id, error: message });
    }
};
