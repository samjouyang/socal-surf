// Major NOAA CO-OPS tide prediction stations along the US West Coast.
// Used to assign the nearest official tide station to each coastline segment.
// Station IDs are real CO-OPS IDs (api.tidesandcurrents.gov).

export interface TideStation {
  id: string
  name: string
  lat: number
  lon: number
}

export const TIDE_STATIONS: TideStation[] = [
  { id: '9443090', name: 'Neah Bay, WA', lat: 48.37, lon: -124.6 },
  { id: '9440910', name: 'Toke Point, WA', lat: 46.71, lon: -123.97 },
  { id: '9439040', name: 'Astoria, OR', lat: 46.21, lon: -123.77 },
  { id: '9437540', name: 'Garibaldi, OR', lat: 45.55, lon: -123.92 },
  { id: '9435380', name: 'South Beach, OR', lat: 44.63, lon: -124.04 },
  { id: '9432780', name: 'Charleston, OR', lat: 43.35, lon: -124.32 },
  { id: '9431647', name: 'Port Orford, OR', lat: 42.74, lon: -124.5 },
  { id: '9419750', name: 'Crescent City, CA', lat: 41.75, lon: -124.18 },
  { id: '9418767', name: 'North Spit (Humboldt), CA', lat: 40.77, lon: -124.22 },
  { id: '9416841', name: 'Arena Cove, CA', lat: 38.91, lon: -123.71 },
  { id: '9415020', name: 'Point Reyes, CA', lat: 37.99, lon: -122.98 },
  { id: '9414290', name: 'San Francisco, CA', lat: 37.81, lon: -122.47 },
  { id: '9413450', name: 'Monterey, CA', lat: 36.61, lon: -121.89 },
  { id: '9412110', name: 'Port San Luis, CA', lat: 35.17, lon: -120.76 },
  { id: '9411340', name: 'Santa Barbara, CA', lat: 34.4, lon: -119.69 },
  { id: '9410840', name: 'Santa Monica, CA', lat: 34.01, lon: -118.5 },
  { id: '9410660', name: 'Los Angeles, CA', lat: 33.72, lon: -118.27 },
  { id: '9410230', name: 'La Jolla, CA', lat: 32.87, lon: -117.26 },
  { id: '9410170', name: 'San Diego, CA', lat: 32.71, lon: -117.17 },
]

/** Equirectangular approximation is plenty accurate for nearest-station lookup. */
export function nearestTideStation(lat: number, lon: number): TideStation {
  let best = TIDE_STATIONS[0]
  let bestDist = Number.POSITIVE_INFINITY
  for (const s of TIDE_STATIONS) {
    const dLat = lat - s.lat
    const dLon = (lon - s.lon) * Math.cos((lat * Math.PI) / 180)
    const d = dLat * dLat + dLon * dLon
    if (d < bestDist) {
      bestDist = d
      best = s
    }
  }
  return best
}
