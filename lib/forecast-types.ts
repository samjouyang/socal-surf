// Shared types for the surf forecast domain.

/** One component of the swell train (a distinct wave system). */
export type SwellKind = 'primary' | 'secondary' | 'windsea'

export interface SwellComponent {
  kind: SwellKind
  /** Significant height, meters */
  height: number
  /** Peak period, seconds */
  period: number
  /** Direction it is coming FROM, degrees (0 = N, 90 = E) */
  direction: number
}

export interface HourlyPoint {
  /** Local ISO time, e.g. "2026-09-09T14:00" */
  time: string
  /** Primary swell significant height, meters */
  swellHeight: number
  /** Primary swell period, seconds */
  swellPeriod: number
  /** Direction the swell is coming FROM, degrees (0 = N, 90 = E) */
  swellDirection: number
  /**
   * Up to three swell components (primary + secondary swell + local wind sea),
   * insignificant ones dropped. Ordered most to least energetic.
   */
  swells: SwellComponent[]
  /** Total sea state (combined), meters — used as a fallback */
  waveHeight: number
  /** Wind speed at 10m, mph */
  windSpeed: number
  /** Direction the wind is coming FROM, degrees */
  windDirection: number
  /** Sea surface temperature, Celsius */
  waterTemp: number
  /** Modeled tidal height at this hour, meters relative to mean sea level. Null if unavailable. */
  tide: number | null
}

export interface SegmentForecast {
  id: string
  hours: HourlyPoint[]
}

export interface ForecastResponse {
  generatedAt: string
  /** Shared local ISO time axis for every segment. */
  times: string[]
  segments: SegmentForecast[]
  /** Non-fatal notes (e.g. a tide station that failed to load). */
  warnings: string[]
}
