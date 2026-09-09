import { NextResponse } from 'next/server'
import { COAST_SEGMENTS } from '@/lib/coastline'
import type { ForecastResponse, HourlyPoint, SegmentForecast, SwellComponent } from '@/lib/forecast-types'

// Aggregates free public data (no API keys) into one cached forecast payload:
//  - Open-Meteo Marine API   -> swell height/period/direction, wave height, SST,
//                               and modeled tidal sea level (sea_level_height_msl)
//  - Open-Meteo Forecast API -> 10m wind speed/direction
// Both are built on NOAA/ECMWF models. The client re-scores locally as the time
// slider moves, so we return raw hourly data rather than precomputed scores.

export const revalidate = 3600 // seconds; keeps us well within rate limits

const TZ = 'America/Los_Angeles'
const FORECAST_DAYS = 5
const BATCH = 100 // coordinates per Open-Meteo request

type OMHourly = {
  time: string[]
  [k: string]: (number | null)[] | string[]
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Open-Meteo returns an array for multi-location requests, an object for one. */
function asArray<T>(json: T | T[]): T[] {
  return Array.isArray(json) ? json : [json]
}

async function fetchMarine(batch: typeof COAST_SEGMENTS): Promise<OMHourly[]> {
  const url = new URL('https://marine-api.open-meteo.com/v1/marine')
  url.searchParams.set('latitude', batch.map((s) => s.lat).join(','))
  url.searchParams.set('longitude', batch.map((s) => s.lon).join(','))
  url.searchParams.set(
    'hourly',
    [
      'swell_wave_height',
      'swell_wave_period',
      'swell_wave_direction',
      'secondary_swell_wave_height',
      'secondary_swell_wave_period',
      'secondary_swell_wave_direction',
      'wind_wave_height',
      'wind_wave_period',
      'wind_wave_direction',
      'wave_height',
      'sea_surface_temperature',
      'sea_level_height_msl',
    ].join(','),
  )
  url.searchParams.set('timezone', TZ)
  url.searchParams.set('forecast_days', String(FORECAST_DAYS))
  url.searchParams.set('cell_selection', 'sea')
  const res = await fetch(url, { next: { revalidate } })
  if (!res.ok) throw new Error(`Marine API ${res.status}`)
  const json = await res.json()
  return asArray(json).map((r: { hourly: OMHourly }) => r.hourly)
}

async function fetchWind(batch: typeof COAST_SEGMENTS): Promise<OMHourly[]> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', batch.map((s) => s.lat).join(','))
  url.searchParams.set('longitude', batch.map((s) => s.lon).join(','))
  url.searchParams.set('hourly', 'wind_speed_10m,wind_direction_10m')
  url.searchParams.set('wind_speed_unit', 'mph')
  url.searchParams.set('timezone', TZ)
  url.searchParams.set('forecast_days', String(FORECAST_DAYS))
  url.searchParams.set('cell_selection', 'sea')
  const res = await fetch(url, { next: { revalidate } })
  if (!res.ok) throw new Error(`Wind API ${res.status}`)
  const json = await res.json()
  return asArray(json).map((r: { hourly: OMHourly }) => r.hourly)
}

function num(arr: (number | null)[] | string[] | undefined, i: number): number {
  const v = arr?.[i]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

const r2 = (x: number) => Math.round(x * 100) / 100
const r1 = (x: number) => Math.round(x * 10) / 10

/**
 * Build the swell train for one hour from the model's partitioned components
 * (primary swell, secondary swell, local wind sea). Insignificant components
 * are dropped so we only surface real, meaningful swells, capped at three and
 * ordered by wave energy (height^2 * period).
 */
function buildSwells(m: OMHourly | undefined, i: number): SwellComponent[] {
  const raw: SwellComponent[] = [
    { kind: 'primary', height: num(m?.swell_wave_height, i), period: num(m?.swell_wave_period, i), direction: num(m?.swell_wave_direction, i) },
    { kind: 'secondary', height: num(m?.secondary_swell_wave_height, i), period: num(m?.secondary_swell_wave_period, i), direction: num(m?.secondary_swell_wave_direction, i) },
    { kind: 'windsea', height: num(m?.wind_wave_height, i), period: num(m?.wind_wave_period, i), direction: num(m?.wind_wave_direction, i) },
  ]
  const primaryH = raw[0].height
  const kept = raw.filter((s) => {
    if (s.height <= 0 || s.period <= 0) return false
    if (s.kind === 'primary') return true
    // A secondary system only matters if it's tall enough on its own AND a
    // meaningful fraction of the dominant swell; otherwise it's noise.
    return s.height >= 0.2 && s.height >= 0.28 * Math.max(primaryH, 0.01)
  })
  const energy = (s: SwellComponent) => s.height * s.height * Math.max(1, s.period)
  kept.sort((a, b) => energy(b) - energy(a))
  return kept.slice(0, 3).map((s) => ({
    kind: s.kind,
    height: r2(s.height),
    period: r1(s.period),
    direction: Math.round(s.direction),
  }))
}

export async function GET() {
  const warnings: string[] = []

  try {
    const batches = chunk(COAST_SEGMENTS, BATCH)

    // Waves + wind in parallel across batches.
    const [marineBatches, windBatches] = await Promise.all([
      Promise.all(batches.map(fetchMarine)),
      Promise.all(batches.map(fetchWind)),
    ])
    const marine = marineBatches.flat()
    const wind = windBatches.flat()

    const times = marine[0]?.time ?? []

    const segments: SegmentForecast[] = COAST_SEGMENTS.map((seg, idx) => {
      const m = marine[idx]
      const w = wind[idx]
      const hasTide = Array.isArray(m?.sea_level_height_msl)
      const hours: HourlyPoint[] = times.map((t, i) => ({
        time: t,
        swellHeight: r2(num(m?.swell_wave_height, i)),
        swellPeriod: r1(num(m?.swell_wave_period, i)),
        swellDirection: Math.round(num(m?.swell_wave_direction, i)),
        swells: buildSwells(m, i),
        waveHeight: r2(num(m?.wave_height, i)),
        windSpeed: Math.round(num(w?.wind_speed_10m, i)),
        windDirection: Math.round(num(w?.wind_direction_10m, i)),
        waterTemp: Math.round(num(m?.sea_surface_temperature, i) * 10) / 10,
        tide: hasTide ? Math.round(num(m?.sea_level_height_msl, i) * 100) / 100 : null,
      }))
      return { id: seg.id, hours }
    })

    if (!times.length) warnings.push('Upstream returned no time axis')

    const payload: ForecastResponse = {
      generatedAt: new Date().toISOString(),
      times,
      segments,
      warnings,
    }
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=7200' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to build forecast: ${message}` }, { status: 502 })
  }
}
