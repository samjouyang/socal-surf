// Static model of the Southern California coast, from Huntington Beach down to
// Imperial Beach, built by interpolating a densely curated set of anchor
// waypoints (points, beaches and headlands) into ~0.4-mile segments. For each
// segment we precompute the shore normal: the compass direction the coast faces
// seaward, i.e. the direction incoming swell must travel FROM to strike it
// head-on.

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

export type Region = 'Orange County' | 'San Diego County'

interface Anchor {
  name: string
  lat: number
  lon: number
}

// North -> South. Ordering matters: the tangent/normal is derived from it.
// Densely sampled so the interpolated shoreline and its facing angles stay
// accurate at sub-mile resolution.
const ANCHORS: Anchor[] = [
  { name: 'Sunset Beach', lat: 33.716, lon: -118.07 },
  { name: 'Bolsa Chica', lat: 33.69, lon: -118.045 },
  { name: 'Huntington Beach Pier', lat: 33.655, lon: -118.006 },
  { name: 'Santa Ana River', lat: 33.63, lon: -117.96 },
  { name: 'Newport Beach Pier', lat: 33.607, lon: -117.93 },
  { name: 'Balboa Peninsula', lat: 33.591, lon: -117.895 },
  { name: 'Corona del Mar', lat: 33.593, lon: -117.87 },
  { name: 'Crystal Cove', lat: 33.568, lon: -117.833 },
  { name: 'Laguna Beach', lat: 33.542, lon: -117.783 },
  { name: 'Aliso Beach', lat: 33.51, lon: -117.752 },
  { name: 'Salt Creek', lat: 33.483, lon: -117.727 },
  { name: 'Dana Point', lat: 33.46, lon: -117.705 },
  { name: 'Doheny', lat: 33.461, lon: -117.68 },
  { name: 'Capistrano Beach', lat: 33.448, lon: -117.66 },
  { name: 'San Clemente Pier', lat: 33.417, lon: -117.621 },
  { name: 'Trestles', lat: 33.385, lon: -117.59 },
  { name: 'San Onofre', lat: 33.366, lon: -117.565 },
  { name: 'Camp Pendleton', lat: 33.3, lon: -117.5 },
  { name: 'Las Pulgas', lat: 33.26, lon: -117.455 },
  { name: 'Oceanside Harbor', lat: 33.211, lon: -117.398 },
  { name: 'Oceanside Pier', lat: 33.193, lon: -117.386 },
  { name: 'Carlsbad', lat: 33.158, lon: -117.352 },
  { name: 'Ponto', lat: 33.108, lon: -117.315 },
  { name: 'Leucadia', lat: 33.07, lon: -117.301 },
  { name: 'Swamis', lat: 33.034, lon: -117.293 },
  { name: 'Cardiff', lat: 33.017, lon: -117.283 },
  { name: 'Solana Beach', lat: 32.991, lon: -117.279 },
  { name: 'Del Mar', lat: 32.959, lon: -117.267 },
  { name: 'Torrey Pines', lat: 32.926, lon: -117.259 },
  { name: 'La Jolla Shores', lat: 32.857, lon: -117.257 },
  { name: 'La Jolla Cove', lat: 32.85, lon: -117.273 },
  { name: "Bird Rock", lat: 32.815, lon: -117.27 },
  { name: 'Pacific Beach', lat: 32.794, lon: -117.256 },
  { name: 'Mission Beach', lat: 32.77, lon: -117.252 },
  { name: 'Ocean Beach', lat: 32.749, lon: -117.253 },
  { name: 'Point Loma', lat: 32.671, lon: -117.244 },
  { name: 'Coronado', lat: 32.685, lon: -117.183 },
  { name: 'Silver Strand', lat: 32.63, lon: -117.135 },
  { name: 'Imperial Beach', lat: 32.579, lon: -117.135 },
]

const EARTH_RADIUS_MI = 3958.8
const SEGMENT_SPACING_MI = 0.4
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
  // Rough Orange County / San Diego County split for a bit of local context.
  return lat >= 33.386 ? 'Orange County' : 'San Diego County'
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

export const REGIONS: Region[] = ['Orange County', 'San Diego County']
