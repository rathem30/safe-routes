import { useEffect, useRef } from "react";
import { LngLatBounds, Map, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { CITY, COVERAGE, MAP_STYLE } from "../config.js";

setWorkerUrl(workerUrl);

const EMPTY = { type: "FeatureCollection", features: [] };
const crimesUrl = `${import.meta.env.BASE_URL}crimes.json`;

function lineFeature(coordinates) {
    return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } };
}

function markerElement(kind) {
    const element = document.createElement("div");
    element.className = `marker marker-${kind}`;
    element.setAttribute("aria-label", kind === "from" ? "Start" : "Destination");
    return element;
}

function coverageOutline() {
    const { south, west, north, east } = COVERAGE;
    return lineFeature([[west, south], [east, south], [east, north], [west, north], [west, south]]);
}

function addLayers(map) {
    map.addSource("coverage", { type: "geojson", data: coverageOutline() });
    map.addLayer({
        id: "coverage-line",
        type: "line",
        source: "coverage",
        paint: { "line-color": "#0b8a6b", "line-width": 1.5, "line-dasharray": [4, 3], "line-opacity": 0.6 },
    });

    map.addSource("crimes", { type: "geojson", data: EMPTY });
    map.addLayer({
        id: "crime-heat",
        type: "heatmap",
        source: "crimes",
        maxzoom: 18,
        layout: { visibility: "none" },
        paint: {
            "heatmap-weight": ["get", "w"],
            "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 11, 4, 14, 18, 17, 90],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 16, 1.4],
            "heatmap-opacity": 0.55,
            "heatmap-color": [
                "interpolate", ["linear"], ["heatmap-density"],
                0, "rgba(253, 219, 199, 0)",
                0.2, "rgba(253, 219, 199, 0.6)",
                0.5, "rgb(244, 165, 130)",
                0.8, "rgb(214, 96, 77)",
                1, "rgb(178, 24, 43)",
            ],
        },
    });

    map.addSource("shortest", { type: "geojson", data: EMPTY });
    map.addLayer({
        id: "shortest-line",
        type: "line",
        source: "shortest",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#5b6472", "line-width": 4, "line-dasharray": [1, 1.6], "line-opacity": 0.85 },
    });

    map.addSource("safe", { type: "geojson", data: EMPTY });
    map.addLayer({
        id: "safe-casing",
        type: "line",
        source: "safe",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 9 },
    });
    map.addLayer({
        id: "safe-line",
        type: "line",
        source: "safe",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0b8a6b", "line-width": 5.5 },
    });
}

async function loadCrimeHeatmap(map) {
    const response = await fetch(crimesUrl);
    const { crimes } = await response.json();
    map.getSource("crimes")?.setData({
        type: "FeatureCollection",
        features: crimes.map(([lat, lon, w]) => ({ type: "Feature", properties: { w }, geometry: { type: "Point", coordinates: [lon, lat] } })),
    });
}

/**
 * MapLibre map showing the two routes, draggable start and end markers and an optional crime heatmap.
 */
export default function MapView({ from, to, result, showHeatmap, fitPadding, onMapClick, onMove }) {
    const container = useRef(null);
    const map = useRef(null);
    const markers = useRef({});
    const loaded = useRef(false);
    const handlers = useRef({ onMapClick, onMove });

    useEffect(() => {
        handlers.current = { onMapClick, onMove };
    });

    useEffect(() => {
        const instance = new Map({
            container: container.current,
            style: MAP_STYLE,
            center: CITY.center,
            zoom: CITY.zoom,
            attributionControl: { compact: true },
        });
        instance.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
        instance.doubleClickZoom.disable();
        instance.on("click", event => handlers.current.onMapClick({ lat: event.lngLat.lat, lon: event.lngLat.lng }));
        instance.on("load", () => {
            addLayers(instance);
            loaded.current = true;
            instance.fire("layers-ready");
        });
        map.current = instance;

        return () => {
            instance.remove();
            map.current = null;
            loaded.current = false;
            markers.current = {};
        };
    }, []);

    // Runs a function once the map style and route layers exist
    function whenReady(callback) {
        const instance = map.current;
        if(!instance) return;
        if(loaded.current) callback(instance);
        else instance.once("layers-ready", () => callback(instance));
    }

    useEffect(() => {
        for(const [kind, place] of [["from", from], ["to", to]]) {
            const existing = markers.current[kind];
            if(!place) {
                existing?.remove();
                delete markers.current[kind];
                continue;
            }
            if(existing) {
                existing.setLngLat([place.lon, place.lat]);
                continue;
            }
            const marker = new Marker({ element: markerElement(kind), draggable: true, anchor: kind === "to" ? "bottom" : "center" })
                .setLngLat([place.lon, place.lat])
                .addTo(map.current);
            marker.on("dragend", () => {
                const { lat, lng } = marker.getLngLat();
                handlers.current.onMove(kind, { lat, lon: lng });
            });
            markers.current[kind] = marker;
        }
    }, [from, to]);

    useEffect(() => {
        whenReady(instance => {
            instance.getSource("safe").setData(result ? lineFeature(result.safe.coordinates) : EMPTY);
            instance.getSource("shortest").setData(result && !result.sameRoute ? lineFeature(result.shortest.coordinates) : EMPTY);
        });
    }, [result]);

    // Frame the trip whenever the endpoints change, not when the slider changes the route
    useEffect(() => {
        if(!from || !to) return;
        const bounds = new LngLatBounds([from.lon, from.lat], [from.lon, from.lat]).extend([to.lon, to.lat]);
        map.current?.fitBounds(bounds, { padding: fitPadding, maxZoom: 16, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [from, to]);

    useEffect(() => {
        if(!from || to) return;
        map.current?.easeTo({ center: [from.lon, from.lat], duration: 500 });
    }, [from, to]);

    const heatmapRequested = useRef(false);
    useEffect(() => {
        whenReady(instance => {
            instance.setLayoutProperty("crime-heat", "visibility", showHeatmap ? "visible" : "none");
            if(showHeatmap && !heatmapRequested.current) {
                heatmapRequested.current = true;
                loadCrimeHeatmap(instance).catch(() => { heatmapRequested.current = false; });
            }
        });
    }, [showHeatmap]);

    return <div ref={container} className="map" />;
}
