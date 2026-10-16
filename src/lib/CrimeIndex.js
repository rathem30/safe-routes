import { METERS_PER_DEGREE, distanceMeters } from "./geo.js";

/**
 * Spatial grid over crime points. Cells are as wide as the influence radius,
 * so any query only has to look at its own cell and the eight around it.
 */
export class CrimeIndex {
    /**
     * @param {number[][]} crimes [latitude, longitude, weight] per report
     * @param {number} radius influence radius in meters
     */
    constructor(crimes, radius) {
        this.crimes = crimes;
        this.radius = radius;
        const meanLat = crimes.length ? crimes.reduce((sum, c) => sum + c[0], 0) / crimes.length : 0;
        this.cellLat = radius / METERS_PER_DEGREE;
        this.cellLon = radius / (METERS_PER_DEGREE * Math.cos(meanLat * Math.PI / 180));
        this.cells = new Map();

        crimes.forEach((crime, i) => {
            const key = this.#key(Math.floor(crime[0] / this.cellLat), Math.floor(crime[1] / this.cellLon));
            const cell = this.cells.get(key);
            if(cell) cell.push(i);
            else this.cells.set(key, [i]);
        });
    }

    #key(row, col) {
        return row * 1e6 + col;
    }

    /** Calls callback(index, distance) for every crime within the radius of a point. */
    forEachNear(lat, lon, callback) {
        const row = Math.floor(lat / this.cellLat);
        const col = Math.floor(lon / this.cellLon);
        for(let r = row - 1; r <= row + 1; r++) {
            for(let c = col - 1; c <= col + 1; c++) {
                const cell = this.cells.get(this.#key(r, c));
                if(!cell) continue;
                for(const i of cell) {
                    const crime = this.crimes[i];
                    const distance = distanceMeters(lat, lon, crime[0], crime[1]);
                    if(distance <= this.radius) callback(i, distance);
                }
            }
        }
    }

    /**
     * Severity-weighted crime density at a point. Each nearby report adds its weight,
     * fading linearly to zero at the edge of the radius.
     */
    riskAt(lat, lon) {
        let risk = 0;
        this.forEachNear(lat, lon, (i, distance) => {
            risk += this.crimes[i][2] * (1 - distance / this.radius);
        });
        return risk;
    }
}
