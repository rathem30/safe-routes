// Crimes within this distance of a street affect its cost
export const CRIME_RADIUS_METERS = 100;

// Spacing of the points sampled along each street when measuring its risk
export const RISK_SAMPLE_SPACING_METERS = 25;

// Safety slider (0-10) multiplied by this gives the risk weight in the edge cost
export const SAFETY_WEIGHT_PER_STEP = 0.5;
export const DEFAULT_SAFETY = 6;

// Average walking pace, about 4.8 km/h
export const WALKING_METERS_PER_MINUTE = 80;

export const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// The crime data covers Columbus, OH
export const CITY = {
    name: "Columbus, OH",
    center: [-82.9988, 39.9612],
    zoom: 13,
};

// Area covered by public/streets.json. Keep in sync with BOUNDS in scripts/build-streets.py
export const COVERAGE = { south: 39.90, west: -83.10, north: 40.07, east: -82.90 };
