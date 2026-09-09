// Small presentation helpers. Times from the API are local wall-clock ISO
// strings ("2026-09-09T14:00") with no timezone, so we parse them by hand to
// avoid the browser reinterpreting them in its own zone.

const TZ = 'America/Los_Angeles'

const COMPASS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
]

export function cardinal(deg: number): string {
  return COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]
}

export function metersToFeet(m: number): number {
  return m * 3.28084
}

export function celsiusToF(c: number): number {
  return c * 1.8 + 32
}

export function hourLabel(iso: string): string {
  const hour = Number(iso.slice(11, 13))
  const h12 = hour % 12 || 12
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`
}

export function dayLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
}

export function fullDayLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

export function isoDate(iso: string): string {
  return iso.slice(0, 10)
}

/** Index of the time slot closest to "now" in America/Los_Angeles, else 0. */
export function getNowIndex(times: string[]): number {
  if (!times.length) return 0
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  let hh = get('hour')
  if (hh === '24') hh = '00'
  const key = `${get('year')}-${get('month')}-${get('day')}T${hh}`
  const found = times.findIndex((t) => t.startsWith(key))
  return found >= 0 ? found : 0
}
