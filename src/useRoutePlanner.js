import { useEffect, useRef, useState } from "react";

const dataUrl = name => new URL(`${import.meta.env.BASE_URL}${name}`, window.location.href).href;
const urls = { streets: dataUrl("streets.json"), crimes: dataUrl("crimes.json") };

let worker = null;
function getWorker() {
    if(!worker) {
        worker = new Worker(new URL("./worker/routeWorker.js", import.meta.url), { type: "module" });
        // Start downloading the street network before the user has picked anything
        worker.postMessage({ type: "preload", urls });
    }
    return worker;
}

/**
 * Plans routes in a Web Worker whenever both points are set.
 * Responses to superseded requests are ignored.
 * @returns {{ result: Object | null, error: string | null, loading: boolean }}
 */
export default function useRoutePlanner(from, to, safety) {
    const [response, setResponse] = useState({ id: 0, result: null, error: null });
    const [requestedId, setRequestedId] = useState(0);
    const latestId = useRef(0);

    useEffect(() => {
        const handle = ({ data }) => {
            if(data.id === latestId.current) setResponse(data);
        };
        getWorker().addEventListener("message", handle);
        return () => getWorker().removeEventListener("message", handle);
    }, []);

    const ready = Boolean(from && to);

    useEffect(() => {
        if(!ready) return;
        // Wait briefly so dragging the safety slider sends one request, not dozens
        const timeout = setTimeout(() => {
            const id = ++latestId.current;
            setRequestedId(id);
            getWorker().postMessage({ type: "plan", id, from, to, safety, urls });
        }, 120);
        return () => clearTimeout(timeout);
    }, [ready, from, to, safety]);

    if(!ready) return { result: null, error: null, loading: false };
    const current = requestedId !== 0 && response.id === requestedId;
    return {
        // Keep showing the previous route while a new one is computed
        result: response.result ?? null,
        error: current ? response.error ?? null : null,
        loading: !current,
    };
}
