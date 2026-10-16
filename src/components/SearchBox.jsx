import { useId, useRef, useState } from "react";
import { searchPlaces } from "../lib/geocode.js";
import { CloseIcon } from "./icons.jsx";

/**
 * Address input. Searches on Enter (Nominatim does not allow autocomplete)
 * and shows up to five matches to pick from.
 */
export default function SearchBox({ label, marker, place, placeholder, onSelect, onClear }) {
    const id = useId();
    const [query, setQuery] = useState("");
    const [editing, setEditing] = useState(false);
    const [results, setResults] = useState(null);
    const [status, setStatus] = useState("");
    const controller = useRef(null);

    const value = editing ? query : place?.label ?? "";

    async function search(event) {
        event.preventDefault();
        const text = query.trim();
        if(!text) return;
        controller.current?.abort();
        controller.current = new AbortController();
        setStatus("Searching…");
        setResults(null);
        try {
            const places = await searchPlaces(text, controller.current.signal);
            setResults(places);
            setStatus(places.length ? "" : "No matches in central Columbus.");
        }
        catch(error) {
            if(error.name !== "AbortError") setStatus("Search is unavailable right now.");
        }
    }

    function choose(choice) {
        onSelect(choice);
        setEditing(false);
        setResults(null);
        setStatus("");
    }

    return (
        <form className="search" onSubmit={search} role="search">
            <label htmlFor={id} className="search-label">
                <span className={`dot dot-${marker}`} aria-hidden="true" />
                {label}
            </label>
            <div className="search-field">
                <input
                    id={id}
                    type="search"
                    autoComplete="off"
                    placeholder={placeholder}
                    value={value}
                    onFocus={event => {
                        setEditing(true);
                        setQuery(place?.label ?? "");
                        // Select the current place so typing replaces it
                        const input = event.currentTarget;
                        requestAnimationFrame(() => input.select());
                    }}
                    onBlur={() => { if(!results) setEditing(false); }}
                    onChange={event => setQuery(event.target.value)}
                    onKeyDown={event => { if(event.key === "Escape") { setResults(null); setEditing(false); event.currentTarget.blur(); } }}
                />
                {place && !editing && (
                    <button type="button" className="icon-button" onClick={onClear} aria-label={`Clear ${label.toLowerCase()}`}><CloseIcon /></button>
                )}
            </div>
            {status && <p className="search-status" role="status">{status}</p>}
            {results?.length > 0 && (
                <ul className="search-results">
                    {results.map(result => (
                        <li key={`${result.lat},${result.lon}`}>
                            <button type="button" onClick={() => choose(result)}>{result.label}</button>
                        </li>
                    ))}
                </ul>
            )}
        </form>
    );
}
