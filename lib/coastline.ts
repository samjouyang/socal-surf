// Static model of the Southern California coast, from Point Dume (Malibu, the
// northwest end of Los Angeles County) down to Imperial Beach, built by
// interpolating a densely curated set of anchor waypoints (points, beaches and
// headlands) into ~0.4-mile segments. For each segment we precompute the shore
// normal: the compass direction the coast faces seaward, i.e. the direction
// incoming swell must travel FROM to strike it head-on.

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
  /**
   * Curated seafloor-focus multiplier for the effective wave size. 1 = a normal
   * open-shelf beach; >1 where offshore bathymetry (a submarine canyon) refracts
   * and focuses swell energy, jacking up size; <1 where a wide, shallow shelf
   * bleeds energy before it reaches the sand. This stands in for live nearshore
   * bathymetric refraction, which no free public API provides.
   */
  focus: number
  /** Short reason shown in the UI when focus != 1, else null. */
  focusLabel: string | null
}

export type Region = 'Los Angeles County' | 'Orange County' | 'San Diego County'

interface Anchor {
  name: string
  lat: number
  lon: number
  region: Region
}

// North -> South. Ordering matters: the tangent/normal is derived from it.
// Densely sampled so the interpolated shoreline and its facing angles stay
// accurate at sub-mile resolution.
const LA = 'Los Angeles County' as const
const OC = 'Orange County' as const
const SD = 'San Diego County' as const

const ANCHORS: Anchor[] = [
  // --- Los Angeles County: Point Dume (Malibu) around to Long Beach ---
  { name: 'Point Dume', lat: 33.997, lon: -118.804, region: LA },
  { name: 'Paradise Cove', lat: 34.013, lon: -118.789, region: LA },
  { name: 'Escondido Beach', lat: 34.028, lon: -118.752, region: LA },
  { name: 'Latigo Point', lat: 34.033, lon: -118.727, region: LA },
  { name: 'Malibu Colony', lat: 34.031, lon: -118.692, region: LA },
  { name: 'Surfrider', lat: 34.037, lon: -118.677, region: LA },
  { name: 'Carbon Beach', lat: 34.036, lon: -118.652, region: LA },
  { name: 'Las Tunas', lat: 34.041, lon: -118.626, region: LA },
  { name: 'Topanga', lat: 34.039, lon: -118.583, region: LA },
  { name: 'Sunset Point', lat: 34.037, lon: -118.548, region: LA },
  { name: 'Will Rogers', lat: 34.031, lon: -118.53, region: LA },
  { name: 'Santa Monica Pier', lat: 34.008, lon: -118.497, region: LA },
  { name: 'Venice Beach', lat: 33.985, lon: -118.474, region: LA },
  { name: 'Marina del Rey', lat: 33.958, lon: -118.456, region: LA },
  { name: 'Dockweiler', lat: 33.921, lon: -118.437, region: LA },
  { name: 'El Porto', lat: 33.9, lon: -118.431, region: LA },
  { name: 'Manhattan Beach', lat: 33.884, lon: -118.411, region: LA },
  { name: 'Hermosa Beach', lat: 33.862, lon: -118.401, region: LA },
  { name: 'Redondo Beach', lat: 33.84, lon: -118.393, region: LA },
  { name: 'Torrance Beach', lat: 33.813, lon: -118.392, region: LA },
  { name: 'Malaga Cove', lat: 33.801, lon: -118.401, region: LA },
  { name: 'Lunada Bay', lat: 33.778, lon: -118.425, region: LA },
  { name: 'Point Vicente', lat: 33.744, lon: -118.41, region: LA },
  { name: 'Portuguese Bend', lat: 33.741, lon: -118.365, region: LA },
  { name: 'Inspiration Point', lat: 33.735, lon: -118.33, region: LA },
  { name: 'Point Fermin', lat: 33.706, lon: -118.293, region: LA },
  { name: 'Cabrillo Beach', lat: 33.708, lon: -118.273, region: LA },
  // Harbor mouth: the Port of LA/Long Beach breakwater complex sits between
  // here and Long Beach, so this stretch crosses sheltered harbor water.
  { name: 'Belmont Shore', lat: 33.759, lon: -118.146, region: LA },
  { name: 'Alamitos Bay', lat: 33.744, lon: -118.113, region: LA },
  // --- Orange County ---
  { name: 'Seal Beach', lat: 33.735, lon: -118.1, region: OC },
  { name: 'Sunset Beach', lat: 33.716, lon: -118.07, region: OC },
  { name: 'Bolsa Chica', lat: 33.69, lon: -118.045, region: OC },
  { name: 'Huntington Beach Pier', lat: 33.655, lon: -118.006, region: OC },
  { name: 'Santa Ana River', lat: 33.63, lon: -117.96, region: OC },
  { name: 'Newport Beach Pier', lat: 33.607, lon: -117.93, region: OC },
  { name: 'Balboa Peninsula', lat: 33.591, lon: -117.895, region: OC },
  { name: 'Corona del Mar', lat: 33.593, lon: -117.87, region: OC },
  { name: 'Crystal Cove', lat: 33.568, lon: -117.833, region: OC },
  { name: 'Laguna Beach', lat: 33.542, lon: -117.783, region: OC },
  { name: 'Aliso Beach', lat: 33.51, lon: -117.752, region: OC },
  { name: 'Salt Creek', lat: 33.483, lon: -117.727, region: OC },
  { name: 'Dana Point', lat: 33.46, lon: -117.705, region: OC },
  { name: 'Doheny', lat: 33.461, lon: -117.68, region: OC },
  { name: 'Capistrano Beach', lat: 33.448, lon: -117.66, region: OC },
  { name: 'San Clemente Pier', lat: 33.417, lon: -117.621, region: OC },
  { name: 'San Clemente State', lat: 33.401, lon: -117.604, region: OC },
  // --- San Diego County ---
  { name: 'Trestles', lat: 33.386, lon: -117.593, region: SD },
  { name: 'San Onofre', lat: 33.372, lon: -117.567, region: SD },
  { name: 'SONGS', lat: 33.366, lon: -117.552, region: SD },
  { name: 'San Onofre Bluffs', lat: 33.343, lon: -117.526, region: SD },
  { name: 'Camp Pendleton', lat: 33.31, lon: -117.489, region: SD },
  { name: 'Las Flores', lat: 33.283, lon: -117.462, region: SD },
  { name: 'Aliso Creek', lat: 33.257, lon: -117.448, region: SD },
  { name: 'Santa Margarita', lat: 33.233, lon: -117.416, region: SD },
  { name: 'Oceanside Harbor', lat: 33.211, lon: -117.398, region: SD },
  { name: 'Oceanside Pier', lat: 33.193, lon: -117.386, region: SD },
  { name: 'Carlsbad', lat: 33.158, lon: -117.352, region: SD },
  { name: 'Ponto', lat: 33.108, lon: -117.315, region: SD },
  { name: 'Leucadia', lat: 33.07, lon: -117.301, region: SD },
  { name: 'Swamis', lat: 33.034, lon: -117.293, region: SD },
  { name: 'Cardiff', lat: 33.017, lon: -117.283, region: SD },
  { name: 'Solana Beach', lat: 32.991, lon: -117.279, region: SD },
  { name: 'Del Mar', lat: 32.959, lon: -117.267, region: SD },
  { name: 'Torrey Pines', lat: 32.926, lon: -117.259, region: SD },
  { name: 'La Jolla Shores', lat: 32.857, lon: -117.257, region: SD },
  { name: 'La Jolla Cove', lat: 32.85, lon: -117.273, region: SD },
  { name: 'Bird Rock', lat: 32.815, lon: -117.27, region: SD },
  { name: 'Pacific Beach', lat: 32.794, lon: -117.256, region: SD },
  { name: 'Mission Beach', lat: 32.77, lon: -117.252, region: SD },
  { name: 'Ocean Beach', lat: 32.749, lon: -117.253, region: SD },
  { name: 'Point Loma', lat: 32.671, lon: -117.244, region: SD },
  { name: 'Coronado', lat: 32.685, lon: -117.183, region: SD },
  { name: 'Silver Strand', lat: 32.63, lon: -117.135, region: SD },
  { name: 'Imperial Beach', lat: 32.579, lon: -117.135, region: SD },
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

// Curated bathymetric-focus zones. `gain` is the peak multiplier at the center,
// falling off smoothly to 1 by `radiusMi`. These encode well-documented seafloor
// features rather than a live depth model.
interface FocusZone {
  lat: number
  lon: number
  radiusMi: number
  gain: number
  label: string
}

const FOCUS_ZONES: FocusZone[] = [
  // Scripps + La Jolla submarine canyons funnel swell straight into Blacks Beach,
  // which is why it holds dramatically bigger surf than the beaches beside it.
  { lat: 32.889, lon: -117.253, radiusMi: 1.6, gain: 1.42, label: 'Scripps Canyon focus (Blacks)' },
  // Newport submarine canyon comes within ~1/4 mi of shore and wedges swell at
  // the Wedge / Newport Point.
  { lat: 33.593, lon: -117.881, radiusMi: 1.3, gain: 1.32, label: 'Newport Canyon focus (The Wedge)' },
  // La Jolla Canyon also lifts the Shores/Windansea stretch a little.
  { lat: 32.855, lon: -117.262, radiusMi: 1.0, gain: 1.14, label: 'La Jolla Canyon focus' },
  // Broad, shallow shelf across the Silver Strand saps swell before it lands.
  { lat: 32.63, lon: -117.14, radiusMi: 2.2, gain: 0.9, label: 'Wide shallow shelf' },
]

function focusAt(lat: number, lon: number): { focus: number; focusLabel: string | null } {
  let best = { focus: 1, focusLabel: null as string | null, weight: 0 }
  for (const z of FOCUS_ZONES) {
    const d = haversineMiles(lat, lon, z.lat, z.lon)
    if (d >= z.radiusMi) continue
    // Smooth cosine falloff from center (full gain) to edge (neutral).
    const t = 1 - d / z.radiusMi
    const weight = t * t * (3 - 2 * t)
    const focus = 1 + (z.gain - 1) * weight
    // Keep the strongest deviation from neutral.
    if (Math.abs(focus - 1) > Math.abs(best.focus - 1)) {
      best = { focus, focusLabel: z.label, weight }
    }
  }
  return { focus: Math.round(best.focus * 100) / 100, focusLabel: best.focusLabel }
}

function buildSegments(): CoastSegment[] {
  // 1. Densify the anchor polyline to ~0.4-mile spacing.
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
    // We traverse anchors N->S (Point Dume down to Imperial Beach) with the open
    // ocean always on the right-hand side, so the seaward normal is the tangent
    // rotated 90° clockwise. Unlike a "faces west" assumption, this stays correct
    // for the south-facing coast through Malibu, Santa Monica Bay, Palos Verdes
    // and San Pedro.
    const normal = (tangent + 90) % 360

    const { lat, lon } = pts[i]
    const station = nearestTideStation(lat, lon)
    // The nearest anchor supplies both the display name and the county, which
    // stays correct where the coast wraps (e.g. Point Fermin sits south of
    // Orange County's Seal Beach but is still Los Angeles County).
    const nearest = ANCHORS.reduce<{ anchor: Anchor; d: number }>(
      (acc, a) => {
        const d = haversineMiles(lat, lon, a.lat, a.lon)
        return d < acc.d ? { anchor: a, d } : acc
      },
      { anchor: ANCHORS[0], d: Number.POSITIVE_INFINITY },
    )
    const { focus, focusLabel } = focusAt(lat, lon)

    segments.push({
      id: `seg-${i.toString().padStart(3, '0')}`,
      name: `${nearest.anchor.name} area`,
      region: nearest.anchor.region,
      lat: Math.round(lat * 1000) / 1000,
      lon: Math.round(lon * 1000) / 1000,
      shoreNormalDeg: Math.round(normal),
      tideStationId: station.id,
      tideStationName: station.name,
      focus,
      focusLabel,
    })
  }
  return segments
}

export const COAST_SEGMENTS: CoastSegment[] = buildSegments()

export const REGIONS: Region[] = ['Los Angeles County', 'Orange County', 'San Diego County']
