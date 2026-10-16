"""Builds public/streets.json, the walkable street network for central Columbus.

Shipping the network as a static file means the app never depends on a live
Overpass server, and routes are found instantly.

Usage:
    pip install osmium
    curl -LO https://download.geofabrik.de/north-america/us/ohio-latest.osm.pbf
    python scripts/build-streets.py ohio-latest.osm.pbf public/streets.json
"""

import json
import sys

import osmium

# Central Columbus, where the crime data is densest. Keep in sync with COVERAGE in src/config.js
BOUNDS = {"south": 39.90, "west": -83.10, "north": 40.07, "east": -82.90}

# Roads people cannot or should not walk along
EXCLUDED_HIGHWAYS = {
    "motorway", "motorway_link", "trunk", "trunk_link", "service", "construction",
    "proposed", "raceway", "bus_guideway", "abandoned", "platform", "corridor", "elevator", "bridleway",
}
NO_ACCESS = {"no", "private"}

PRECISION = 1e5  # 5 decimal places, about 1 m


def inside(lat, lon):
    return BOUNDS["south"] <= lat <= BOUNDS["north"] and BOUNDS["west"] <= lon <= BOUNDS["east"]


class Streets(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.index = {}
        self.lat = []
        self.lon = []
        self.edges = []

    def node_index(self, ref, lat, lon):
        index = self.index.get(ref)
        if index is None:
            index = len(self.lat)
            self.index[ref] = index
            self.lat.append(round(lat * PRECISION))
            self.lon.append(round(lon * PRECISION))
        return index

    def way(self, way):
        tags = way.tags
        highway = tags.get("highway")
        if highway is None or highway in EXCLUDED_HIGHWAYS:
            return
        if tags.get("foot") in NO_ACCESS or tags.get("access") in NO_ACCESS:
            return
        if tags.get("area") == "yes":
            return

        previous = None
        for node in way.nodes:
            location = node.location
            if not location.valid() or not inside(location.lat, location.lon):
                previous = None
                continue
            current = self.node_index(node.ref, location.lat, location.lon)
            if previous is not None and previous != current:
                self.edges.append((previous, current))
            previous = current


def delta(values):
    result = []
    last = 0
    for value in values:
        result.append(value - last)
        last = value
    return result


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else "ohio-latest.osm.pbf"
    output = sys.argv[2] if len(sys.argv) > 2 else "public/streets.json"

    streets = Streets()
    streets.apply_file(source, locations=True)

    # Edges are stored flat and delta-encoded, which compresses well
    flat = [index for edge in streets.edges for index in edge]
    data = {
        "bounds": BOUNDS,
        "precision": PRECISION,
        "lat": delta(streets.lat),
        "lon": delta(streets.lon),
        "edges": delta(flat),
    }
    with open(output, "w") as file:
        json.dump(data, file, separators=(",", ":"))

    print(f"{len(streets.lat)} nodes, {len(streets.edges)} edges written to {output}")


if __name__ == "__main__":
    main()
