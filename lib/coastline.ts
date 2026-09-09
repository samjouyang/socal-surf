// Static model of the US West Coast, built by interpolating a curated set of
// anchor waypoints (major headlands, capes, bays and beaches from Cape Flattery,
// WA down to the Mexico border) into ~5-mile segments. For each segment we
// precompute the shore normal: the compass direction the coast faces seaward,
// i.e. the direction incoming swell must travel FROM to strike it head-on.

import { nearestTideStation } from './tide-stations'

export interface CoastSegment {
  id: string
  name: string
  region: Region
  lat: number
  lon: number
  /** Direction the coast faces (oceanward), degrees. Swell from here hits head-on. */
  shoreNormalDeg: number
  tideStationId: string
  tideStationName: string
}

export type Region =
  | 'Washington'
  | 'Oregon'
  | 'Northern California'
  | 'Central California'
  | 'Southern California'

interface Anchor {
  name: string
  lat: number
  lon: number
}

// North -> South. Ordering matters: the tangent/normal is derived from it.
const ANCHORS: Anchor[] = [
  { name: 'Cape Flattery', lat: 48.39, lon: -124.73 },
  { name: 'La Push', lat: 47.91, lon: -124.64 },
  { name: 'Kalaloch', lat: 47.61, lon: -124.37 },
  { name: 'Ocean Shores', lat: 46.97, lon: -124.17 },
  { name: 'Cape Disappointment', lat: 46.28, lon: -124.08 },
  { name: 'Seaside', lat: 45.99, lon: -123.93 },
  { name: 'Cape Meares', lat: 45.49, lon: -123.97 },
  { name: 'Pacific City', lat: 45.2, lon: -123.97 },
  { name: 'Newport', lat: 44.62, lon: -124.06 },
  { name: 'Florence', lat: 43.97, lon: -124.11 },
  { name: 'Charleston', lat: 43.34, lon: -124.33 },
  { name: 'Cape Blanco', lat: 42.84, lon: -124.56 },
  { name: 'Gold Beach', lat: 42.41, lon: -124.42 },
  { name: 'Brookings', lat: 42.05, lon: -124.28 },
  { name: 'Crescent City', lat: 41.75, lon: -124.2 },
  { name: 'Trinidad', lat: 41.06, lon: -124.15 },
  { name: 'Eureka', lat: 40.77, lon: -124.23 },
  { name: 'Cape Mendocino', lat: 40.44, lon: -124.41 },
  { name: 'Shelter Cove', lat: 40.02, lon: -124.07 },
  { name: 'Fort Bragg', lat: 39.45, lon: -123.81 },
  { name: 'Point Arena', lat: 38.91, lon: -123.71 },
  { name: 'Bodega Bay', lat: 38.33, lon: -123.05 },
  { name: 'Point Reyes', lat: 38.0, lon: -123.02 },
  { name: 'Ocean Beach SF', lat: 37.76, lon: -122.51 },
  { name: 'Half Moon Bay', lat: 37.5, lon: -122.48 },
  { name: 'Año Nuevo', lat: 37.11, lon: -122.34 },
  { name: 'Santa Cruz', lat: 36.95, lon: -122.03 },
  { name: 'Monterey', lat: 36.62, lon: -121.9 },
  { name: 'Point Sur', lat: 36.31, lon: -121.89 },
  { name: 'Lucia', lat: 36.02, lon: -121.55 },
  { name: 'San Simeon', lat: 35.64, lon: -121.19 },
  { name: 'Morro Bay', lat: 35.37, lon: -120.87 },
  { name: 'Avila Beach', lat: 35.17, lon: -120.75 },
  { name: 'Point Sal', lat: 34.9, lon: -120.67 },
  { name: 'Point Conception', lat: 34.45, lon: -120.47 },
  { name: 'Santa Barbara', lat: 34.4, lon: -119.69 },
  { name: 'Ventura', lat: 34.27, lon: -119.29 },
  { name: 'Point Mugu', lat: 34.09, lon: -119.06 },
  { name: 'Malibu', lat: 34.03, lon: -118.68 },
  { name: 'Santa Monica', lat: 34.01, lon: -118.5 },
  { name: 'Palos Verdes', lat: 33.74, lon: -118.39 },
  { name: 'Seal Beach', lat: 33.74, lon: -118.09 },
  { name: 'Huntington Beach', lat: 33.65, lon: -118.0 },
  { name: 'Newport Beach', lat: 33.6, lon: -117.88 },
  { name: 'Dana Point', lat: 33.46, lon: -117.71 },
  { name: 'San Clemente', lat: 33.42, lon: -117.62 },
  { name: 'Oceanside', lat: 33.19, lon: -117.39 },
  { name: 'Encinitas', lat: 33.04, lon: -117.29 },
  { name: 'La Jolla', lat: 32.85, lon: -117.27 },
  { name: 'Point Loma', lat: 32.67, lon: -117.24 },
  { name: 'Imperial Beach', lat: 32.58, lon: -117.13 },
]

const EARTH_RADIUS_MI = 3958.8
const SEGMENT_SPACING_MI = 5
const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

function haversineMiles(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * DEG2RAD
  const dLon = (bLon - aLon) * DEG2RAD
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * DEG2RAD) * Math.cos(bLat * DEG2RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Initial great-circle bearing from A to B, degrees clockwise from north. */
function bearing(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const y = Math.sin((bLon - aLon) * DEG2RAD) * Math.cos(bLat * DEG2RAD)
  const x =
    Math.cos(aLat * DEG2RAD) * Math.sin(bLat * DEG2RAD) -
    Math.sin(aLat * DEG2RAD) * Math.cos(bLat * DEG2RAD) * Math.cos((bLon - aLon) * DEG2RAD)
  return (Math.atan2(y, x) * RAD2DEG + 360) % 360
}

function regionForLat(lat: number): Region {
  if (lat >= 46.25) return 'Washington'
  if (lat >= 42.0) return 'Oregon'
  if (lat >= 38.9) return 'Northern California'
  if (lat >= 34.45) return 'Central California'
  return 'Southern California'
}

function buildSegments(): CoastSegment[] {
  // 1. Densify the anchor polyline to ~5-mile spacing.
  const pts: { lat: number; lon: number }[] = []
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const a = ANCHORS[i]
    const b = ANCHORS[i + 1]
    const dist = haversineMiles(a.lat, a.lon, b.lat, b.lon)
    const steps = Math.max(1, Math.round(dist / SEGMENT_SPACING_MI))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      pts.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t })
    }
  }
  pts.push({ lat: ANCHORS[ANCHORS.length - 1].lat, lon: ANCHORS[ANCHORS.length - 1].lon })

  // 2. For each point compute the shore normal from the local tangent, forced
  //    to face seaward (west). The ocean is always to the west here, so of the
  //    two perpendiculars we keep the one with a westward component.
  const segments: CoastSegment[] = []
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const tangent = bearing(prev.lat, prev.lon, next.lat, next.lon)
    const candA = (tangent + 90) % 360
    const candB = (tangent + 270) % 360
    // Westward bearing has sin < 0. Pick the more westward-facing normal.
    const normal = Math.sin(candA * DEG2RAD) < Math.sin(candB * DEG2RAD) ? candA : candB

    const { lat, lon } = pts[i]
    const region = regionForLat(lat)
    const station = nearestTideStation(lat, lon)
    const nearestAnchor = ANCHORS.reduce((acc, a) => {
      const d = haversineMiles(lat, lon, a.lat, a.lon)
      return d < acc.d ? { name: a.name, d } : acc
    }, { name: ANCHORS[0].name, d: Number.POSITIVE_INFINITY })

    segments.push({
      id: `seg-${i.toString().padStart(3, '0')}`,
      name: `${nearestAnchor.name} area`,
      region,
      lat: Math.round(lat * 1000) / 1000,
      lon: Math.round(lon * 1000) / 1000,
      shoreNormalDeg: Math.round(normal),
      tideStationId: station.id,
      tideStationName: station.name,
    })
  }
  return segments
}

export const COAST_SEGMENTS: CoastSegment[] = buildSegments()

export const REGIONS: Region[] = [
  'Washington',
  'Oregon',
  'Northern California',
  'Central California',
  'Southern California',
]
