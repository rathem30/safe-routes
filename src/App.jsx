import { useEffect, useState } from "react";
import MapView from "./components/MapView.jsx";
import SearchBox from "./components/SearchBox.jsx";
import RouteSummary from "./components/RouteSummary.jsx";
import useRoutePlanner from "./useRoutePlanner.js";
import { CITY, DEFAULT_SAFETY } from "./config.js";

const REPO_URL = "https://github.com/rathem30/safe-routes";

function pinnedPlace(point) {
    return { ...point, label: `Dropped pin (${point.lat.toFixed(4)}, ${point.lon.toFixed(4)})` };
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

    // Leave room for the panel when framing a route
    const fitPadding = wide
        ? { top: 60, bottom: 60, left: 420, right: 60 }
        : { top: 40, bottom: 320, left: 30, right: 30 };

    function handleMapClick(point) {
        if(!from) setFrom(pinnedPlace(point));
        else setTo(pinnedPlace(point));
    }

    function handleMove(kind, point) {
        (kind === "from" ? setFrom : setTo)(pinnedPlace(point));
    }

    function swap() {
        setFrom(to);
        setTo(from);
    }

    const hint = !from
        ? "Search for a place, or click the map to set your start."
        : !to ? "Now pick a destination. Click the map or search." : null;

    return (
        <div className="app">
            <MapView
                from={from}
                to={to}
                result={result}
                showHeatmap={showHeatmap}
                fitPadding={fitPadding}
                onMapClick={handleMapClick}
                onMove={handleMove}
            />

            <aside className="panel" aria-label="Route planner">
                <header className="panel-header">
                    <h1>Safe Routes</h1>
                    <p>Walking directions in {CITY.name} that steer around reported crime.</p>
                </header>

                <div className="places">
                    <SearchBox label="From" marker="from" place={from} placeholder="Start address or place" onSelect={setFrom} onClear={() => setFrom(null)} />
                    <SearchBox label="To" marker="to" place={to} placeholder="Destination" onSelect={setTo} onClear={() => setTo(null)} />
                    <button type="button" className="swap" onClick={swap} disabled={!from && !to} aria-label="Swap start and destination" title="Swap">⇅</button>
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
                    {!error && loading && <p className="note loading">Finding the safest walk…</p>}
                    {!error && !loading && result && <RouteSummary result={result} />}
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
                        Based on Columbus Police reports through Nov 2023. Reports reflect where crime was reported, not
                        how safe a street is. Use your own judgement. <a href={REPO_URL} target="_blank" rel="noreferrer">How it works</a>
                    </p>
                </footer>
            </aside>
        </div>
    );
}
