import { WALKING_METERS_PER_MINUTE } from "../config.js";

function formatDistance(meters) {
    return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

function minutes(meters) {
    return Math.max(1, Math.round(meters / WALKING_METERS_PER_MINUTE));
}

function formatMinutes(meters) {
    return `${minutes(meters)} min`;
}

/** Compares the safer route with the shortest one. While updating, the previous numbers stay in place, dimmed. */
export default function RouteSummary({ result, updating }) {
    const { safe, shortest, sameRoute } = result;

    if(sameRoute) {
        return (
            <section className={`summary${updating ? " is-updating" : ""}`} aria-busy={updating}>
                <p className="headline">{formatMinutes(safe.length)} · {formatDistance(safe.length)}</p>
                <p className="note">The shortest route is already the lowest-risk option at this setting.</p>
            </section>
        );
    }

    const extraMinutes = minutes(safe.length) - minutes(shortest.length);
    const reduction = shortest.exposure > 0 ? Math.round((1 - safe.exposure / shortest.exposure) * 100) : 0;

    return (
        <section className={`summary${updating ? " is-updating" : ""}`} aria-busy={updating}>
            <p className="headline">
                {extraMinutes > 0 ? `+${extraMinutes} min` : "About the same time"}
                <span className="headline-accent"> · {reduction}% less crime exposure</span>
            </p>
            <table className="compare">
                <thead>
                    <tr><th scope="col"></th><th scope="col">Safer</th><th scope="col">Shortest</th></tr>
                </thead>
                <tbody>
                    <tr><th scope="row">Walk</th><td>{formatMinutes(safe.length)}</td><td>{formatMinutes(shortest.length)}</td></tr>
                    <tr><th scope="row">Distance</th><td>{formatDistance(safe.length)}</td><td>{formatDistance(shortest.length)}</td></tr>
                </tbody>
            </table>
        </section>
    );
}
