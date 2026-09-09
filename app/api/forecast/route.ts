import { NextResponse } from 'next/server'
import { COAST_SEGMENTS } from '@/lib/coastline'
import type { ForecastResponse, HourlyPoint, SegmentForecast } from '@/lib/forecast-types'

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
    'swell_wave_height,swell_wave_period,swell_wave_direction,wave_height,sea_surface_temperature,sea_level_height_msl',
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
        swellHeight: Math.round(num(m?.swell_wave_height, i) * 100) / 100,
        swellPeriod: Math.round(num(m?.swell_wave_period, i) * 10) / 10,
        swellDirection: Math.round(num(m?.swell_wave_direction, i)),
        waveHeight: Math.round(num(m?.wave_height, i) * 100) / 100,
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
