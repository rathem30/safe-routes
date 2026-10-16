// Columbus Division of Police incidents from the City of Columbus open data service.
// Locations are published at block level, and no personal data is included.

const SERVICE = "https://services1.arcgis.com/9yy6msODkIBzkUXU/arcgis/rest/services/Police_Incident_Reports/FeatureServer/0/query";
const PAGE_SIZE = 2000;

function isoTimestamp(date) {
    return date.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * @param {{ south: number, west: number, north: number, east: number }} bounds
 * @param {Date} since
 * @returns {Promise<{ id: string, lat: number, lon: number, occurred: Date, subject: string }[]>}
 */
export async function fetchCpdIncidents(bounds, since) {
    const incidents = [];
    for(let offset = 0; ; offset += PAGE_SIZE) {
        const params = new URLSearchParams({
            where: `OccurredOn >= TIMESTAMP '${isoTimestamp(since)}'`,
            geometry: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
            geometryType: "esriGeometryEnvelope",
            inSR: "4326",
            spatialRel: "esriSpatialRelIntersects",
            outFields: "IncidentNo,OccurredOn,GeneralSubject",
            outSR: "4326",
            geometryPrecision: "5",
            orderByFields: "OBJECTID",
            resultOffset: String(offset),
            resultRecordCount: String(PAGE_SIZE),
            f: "json",
        });
        const response = await fetch(`${SERVICE}?${params}`);
        if(!response.ok) throw new Error(`CPD request failed (${response.status})`);
        const data = await response.json();
        if(data.error) throw new Error(`CPD request failed: ${data.error.message}`);

        for(const { attributes, geometry } of data.features) {
            if(!geometry || attributes.OccurredOn == null) continue;
            incidents.push({
                id: attributes.IncidentNo,
                lat: geometry.y,
                lon: geometry.x,
                occurred: new Date(attributes.OccurredOn),
                subject: attributes.GeneralSubject ?? "",
            });
        }
        if(!data.exceededTransferLimit && data.features.length < PAGE_SIZE) break;
    }
    return incidents;
}
