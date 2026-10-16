import { useEffect, useRef, useState } from "react";
import MapView from "./components/MapView.jsx";
import SearchBox from "./components/SearchBox.jsx";
import RouteSummary from "./components/RouteSummary.jsx";
import useRoutePlanner from "./useRoutePlanner.js";
import { describePoint } from "./lib/geocode.js";
import { SwapIcon } from "./components/icons.jsx";
import { CITY, DEFAULT_SAFETY } from "./config.js";

const REPO_URL = "https://github.com/rathem30/safe-routes";

function pinnedPlace(point) {
    return { ...point, label: "Dropped pin" };
}

/** Height of an element, kept current as it resizes. */
function useHeight(ref) {
    const [height, setHeight] = useState(0);
    useEffect(() => {
        const observer = new ResizeObserver(([entry]) => setHeight(entry.borderBoxSize[0].blockSize));
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, [ref]);
    return height;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Describes where the crime data comes from and how fresh it is. */
function useDataNote() {
    const [note, setNote] = useState(null);
    useEffect(() => {
        fetch(`${import.meta.env.BASE_URL}crimes-meta.json`)
            .then(response => response.json())
            .then(meta => setNote(`Columbus Police and Ohio State Police reports from the last two years, updated ${DATE_FORMAT.format(new Date(meta.updated))}.`))
            .catch(() => setNote("Columbus Police and Ohio State Police reports."));
    }, []);
    return note;
}

function useIsWide() {
    const query = "(min-width: 760px)";
    const [wide, setWide] = useState(() => window.matchMedia(query).matches);
    useEffect(() => {
        const media = window.matchMedia(query);
        const update = () => setWide(media.matches);
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);
    return wide;
}

export default function App() {
    const [from, setFrom] = useState(null);
    const [to, setTo] = useState(null);
    const [safety, setSafety] = useState(DEFAULT_SAFETY);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const { result, error, loading } = useRoutePlanner(from, to, safety);
    const wide = useIsWide();
    const dataNote = useDataNote();
    const panel = useRef(null);
    const panelHeight = useHeight(panel);

    // Leave room for the panel when framing a route: beside it on wide screens, above the sheet on phones
    const fitPadding = wide
        ? { top: 60, bottom: 60, left: 420, right: 60 }
        : { top: 40, bottom: Math.round(panelHeight) + 24, left: 30, right: 30 };

    // Sets a pin, then swaps the placeholder label for the street name once it is known
    function dropPin(kind, point) {
        const set = kind === "from" ? setFrom : setTo;
        set(pinnedPlace(point));
        describePoint(point.lat, point.lon)
            .then(label => {
                if(!label) return;
                set(current => current?.lat === point.lat && current?.lon === point.lon ? { ...current, label } : current);
            })
            .catch(() => {});
    }

    function handleMapClick(point) {
        dropPin(from ? "to" : "from", point);
    }

    function swap() {
        setFrom(to);
        setTo(from);
    }

    const hint = !from
        ? "Search for a place, or pick a point on the map to start."
        : !to ? "Now choose a destination." : null;

    return (
        <div className="app">
            <MapView
                from={from}
                to={to}
                result={result}
                settled={!loading && !error}
                showHeatmap={showHeatmap}
                fitPadding={fitPadding}
                onMapClick={handleMapClick}
                onMove={dropPin}
            />

            <aside className="panel" aria-label="Route planner" ref={panel}>
                <header className="panel-header">
                    <h1>Safe Routes</h1>
                    <p>Walking directions in {CITY.name} that steer around reported crime.</p>
                </header>

                <div className="places">
                    <SearchBox label="From" marker="from" place={from} placeholder="Start address or place" onSelect={setFrom} onClear={() => setFrom(null)} />
                    <SearchBox label="To" marker="to" place={to} placeholder="Destination" onSelect={setTo} onClear={() => setTo(null)} />
                    <button type="button" className="swap" onClick={swap} disabled={!from && !to} aria-label="Swap start and destination" title="Swap start and destination"><SwapIcon /></button>
                </div>

                <div className="safety">
                    <label htmlFor="safety">Route preference</label>
                    <input
                        id="safety"
                        type="range"
                        min="0"
                        max="10"
                        step="1"
                        value={safety}
                        onChange={event => setSafety(Number(event.target.value))}
                        aria-valuetext={safety === 0 ? "Shortest" : `Safety ${safety} of 10`}
                    />
                    <div className="safety-scale" aria-hidden="true"><span>Shortest</span><span>Safest</span></div>
                </div>

                <div className="result" aria-live="polite">
                    {hint && <p className="note">{hint}</p>}
                    {error && <p className="error">{error}</p>}
                    {!error && loading && !result && <p className="note loading">Finding the safest walk…</p>}
                    {!error && result && <RouteSummary result={result} updating={loading} />}
                </div>

                <footer className="panel-footer">
                    <div className="legend">
                        <span><i className="swatch swatch-safe" />Safer route</span>
                        <span><i className="swatch swatch-shortest" />Shortest route</span>
                    </div>
                    <label className="toggle">
                        <input type="checkbox" checked={showHeatmap} onChange={event => setShowHeatmap(event.target.checked)} />
                        Show crime heatmap
                    </label>
                    <p className="fineprint">
                        {dataNote} Reports show where crime was reported, not how safe a street is. Use your own
                        judgement. <a href={REPO_URL} target="_blank" rel="noreferrer">How it works</a>
                    </p>
                </footer>
            </aside>
        </div>
    );
}
