export const METERS_PER_DEGREE = 111195;

/**
 * Distance in meters between two coordinates. Equirectangular approximation,
 * accurate to well under 1% at city scale and much cheaper than haversine.
 */
export function distanceMeters(lat1, lon1, lat2, lon2) {
    const x = (lon2 - lon1) * Math.cos((lat1 + lat2) * Math.PI / 360);
    const y = lat2 - lat1;
    return Math.hypot(x, y) * METERS_PER_DEGREE;
}

export function boundsContain({ south, west, north, east }, { lat, lon }) {
    return lat >= south && lat <= north && lon >= west && lon <= east;
}
