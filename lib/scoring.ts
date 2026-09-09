// Physics-informed surf-quality heuristic.
//
// Every factor is normalized to 0..1 and the result is an explainable 0..10
// score. This is a transparent model (not calibrated ML): the breakdown makes
// each contribution visible and tunable. Directions follow the meteorological
// convention (the direction a swell/wind comes FROM).

import type { HourlyPoint } from './forecast-types'

export interface ScoreFactor {
  key: 'exposure' | 'period' | 'height' | 'wind' | 'tide'
  label: string
  /** Normalized quality of this factor, 0..1. */
  value: number
  detail: string
}

export interface SurfScore {
  /** 0..10 */
  score: number
  label: string
  factors: ScoreFactor[]
  /** Convenience flags for the detail panel. */
  windType: 'offshore' | 'cross-shore' | 'onshore'
  swellExposed: boolean
}

const DEG2RAD = Math.PI / 180

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

/** Smallest absolute angular difference between two bearings, 0..180. */
function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b + 540) % 360) - 180)
  return d
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * Swell exposure: how directly swell strikes the shore. The shore normal is the
 * oceanward direction; swell coming FROM that bearing hits head-on. Swell from
 * beyond 90 deg of the normal is shadowed by land and cannot reach the beach.
 */
function exposureFactor(swellDir: number, shoreNormal: number) {
  const diff = angleDiff(swellDir, shoreNormal)
  if (diff >= 90) return { value: 0, exposed: false, diff }
  // cos falloff, widened slightly so beaches with an angled window still score.
  const raw = Math.cos(diff * DEG2RAD)
  return { value: clamp01(raw ** 0.7), exposed: true, diff }
}

/** Longer-period groundswell carries more energy and organizes cleaner lines. */
function periodFactor(period: number): number {
  // <6s wind chop -> poor, 10-14s -> good, 16s+ -> pumping.
  return clamp01(0.1 + 0.9 * smoothstep(6, 15, period))
}

/** Rideable-size curve: flat and closed-out both get penalized. */
function heightFactor(heightM: number): number {
  const ramp = smoothstep(0.3, 1.2, heightM) // build in from flat
  const closeout = 1 - smoothstep(3.0, 5.0, heightM) // wash out when huge
  return clamp01(ramp * closeout)
}

/**
 * Wind: offshore wind (blowing from land out to sea) grooms the face and is
 * ideal; onshore wind blows it out. Calm conditions are glassy regardless.
 */
function windFactor(windDir: number, windSpeed: number, shoreNormal: number) {
  const offshoreFrom = (shoreNormal + 180) % 360 // offshore wind comes from inland
  const diff = angleDiff(windDir, offshoreFrom)
  const offshoreness = Math.cos(diff * DEG2RAD) // +1 offshore, -1 onshore
  const s = clamp01(windSpeed / 25)
  const calm = 0.8
  const atSpeed = 0.55 + 0.45 * offshoreness
  const value = clamp01(calm * (1 - s) + atSpeed * s)

  let windType: SurfScore['windType'] = 'cross-shore'
  if (offshoreness > 0.35) windType = 'offshore'
  else if (offshoreness < -0.35) windType = 'onshore'
  return { value, windType, offshoreness }
}

/**
 * Tide: without spot-specific bathymetry we can't know each break's ideal tide,
 * so this is a light modifier that mildly favors a mid tide.
 */
function tideFactor(tide: number | null): { value: number; state: string } {
  if (tide == null) return { value: 0.85, state: 'n/a' }
  // Modeled tide is meters relative to MSL; West Coast swings roughly -1.2..+1.8m.
  // Favor the mid band.
  const norm = clamp01((tide + 1.2) / 3)
  const midness = 1 - Math.abs(norm - 0.5) * 2 // 1 at mid, 0 at extremes
  const value = clamp01(0.75 + 0.25 * midness)
  let state = 'mid'
  if (norm < 0.33) state = 'low'
  else if (norm > 0.66) state = 'high'
  return { value, state }
}

export function scoreLabel(score: number): string {
  if (score < 1.5) return 'Flat'
  if (score < 3) return 'Poor'
  if (score < 4.5) return 'Poor to Fair'
  if (score < 6) return 'Fair'
  if (score < 7.5) return 'Fair to Good'
  if (score < 8.7) return 'Good'
  return 'Epic'
}

const WEIGHTS = { period: 0.3, height: 0.3, wind: 0.3, tide: 0.1 }

export function scoreSurf(point: HourlyPoint, shoreNormalDeg: number): SurfScore {
  const heightM = point.swellHeight > 0 ? point.swellHeight : point.waveHeight
  const exp = exposureFactor(point.swellDirection, shoreNormalDeg)
  const per = periodFactor(point.swellPeriod)
  const hgt = heightFactor(heightM)
  const wind = windFactor(point.windDirection, point.windSpeed, shoreNormalDeg)
  const tide = tideFactor(point.tide)

  const conditions =
    WEIGHTS.period * per + WEIGHTS.height * hgt + WEIGHTS.wind * wind.value + WEIGHTS.tide * tide.value
  // Exposure gates everything: no swell reaching the beach means no surf.
  const exposureMult = exp.exposed ? 0.4 + 0.6 * exp.value : 0
  const score = Math.round(exposureMult * conditions * 10 * 10) / 10

  const factors: ScoreFactor[] = [
    {
      key: 'exposure',
      label: 'Swell exposure',
      value: exp.value,
      detail: exp.exposed
        ? `${Math.round(exp.diff)}\u00b0 off the shore normal`
        : 'Blocked \u2014 swell shadowed by land',
    },
    {
      key: 'period',
      label: 'Swell period',
      value: per,
      detail: `${point.swellPeriod.toFixed(0)}s ${point.swellPeriod >= 12 ? 'groundswell' : point.swellPeriod >= 9 ? 'mid-period' : 'windswell'}`,
    },
    {
      key: 'height',
      label: 'Swell size',
      value: hgt,
      detail: `${(heightM * 3.281).toFixed(1)} ft face`,
    },
    {
      key: 'wind',
      label: 'Wind',
      value: wind.value,
      detail: `${point.windSpeed.toFixed(0)} mph ${wind.windType}`,
    },
    { key: 'tide', label: 'Tide', value: tide.value, detail: `${tide.state} tide` },
  ]

  return {
    score,
    label: scoreLabel(score),
    factors,
    windType: wind.windType,
    swellExposed: exp.exposed,
  }
}

// --- Color scale (poor -> epic), interpolated in RGB for a smooth map ------

const STOPS: { at: number; rgb: [number, number, number] }[] = [
  { at: 0, rgb: [120, 34, 40] }, // deep red (flat)
  { at: 2.5, rgb: [219, 84, 52] }, // orange-red (poor)
  { at: 4.5, rgb: [224, 168, 62] }, // amber (fair)
  { at: 6.5, rgb: [72, 190, 148] }, // teal-green (good)
  { at: 8, rgb: [56, 200, 219] }, // cyan (very good)
  { at: 10, rgb: [120, 235, 180] }, // bright aqua-green (epic)
]

export function colorForScore(score: number): string {
  const s = Math.max(0, Math.min(10, score))
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i]
    const b = STOPS[i + 1]
    if (s >= a.at && s <= b.at) {
      const t = (s - a.at) / (b.at - a.at)
      const r = Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t)
      const g = Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t)
      const bl = Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t)
      return `rgb(${r}, ${g}, ${bl})`
    }
  }
  const last = STOPS[STOPS.length - 1].rgb
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`
}
