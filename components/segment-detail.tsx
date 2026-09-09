'use client'

import { useMemo, useState } from 'react'
import { Waves, Wind, Droplets, Thermometer, Ruler, Layers, Mountain } from 'lucide-react'
import type { CoastSegment } from '@/lib/coastline'
import type { HourlyPoint, SwellComponent } from '@/lib/forecast-types'
import { type SurfScore, colorForScore, scoreSurf, swellReach } from '@/lib/scoring'
import { cardinal, celsiusToF, hourLabel, metersToFeet } from '@/lib/format'
import { CompassArrow } from './compass-arrow'

const SWELL_LABELS: Record<SwellComponent['kind'], string> = {
  primary: 'Primary swell',
  secondary: 'Secondary swell',
  windsea: 'Wind sea',
}

export interface OutlookPoint {
  time: string
  score: number
  index: number
}

type OutlookMode = '24h' | '5day'

export function SegmentDetail({
  seg,
  hours,
  committedIndex,
  onSelectTime,
}: {
  seg: CoastSegment
  hours: HourlyPoint[]
  committedIndex: number
  onSelectTime: (i: number) => void
}) {
  // Hovering an outlook bar previews that hour; the preview only "sticks" when
  // the user clicks it (which commits the time upstream via onSelectTime). While
  // hovering, every readout below reflects the hovered hour without moving the
  // committed time or recoloring the map.
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [mode, setMode] = useState<OutlookMode>('24h')

  const activeIndex = hoverIndex ?? committedIndex
  const point = hours[activeIndex] ?? hours[committedIndex] ?? hours[0]
  const score = useMemo(() => scoreSurf(point, seg), [point, seg])
  const color = colorForScore(score.score)
  const isPreview = hoverIndex !== null && hoverIndex !== committedIndex

  const outlook = useMemo<OutlookPoint[]>(
    () => hours.map((p, i) => ({ time: p.time, score: scoreSurf(p, seg).score, index: i })),
    [hours, seg],
  )
  // 24-hour view: a 24-bar window that follows the committed hour (clamped so it
  // always shows a full day). 5-day view: every hourly bar in the forecast.
  const visibleOutlook = useMemo(() => {
    if (mode === '5day') return outlook
    const start = Math.max(0, Math.min(committedIndex, outlook.length - 24))
    return outlook.slice(start, start + 24)
  }, [outlook, mode, committedIndex])

  // Defensive: a stale/cached forecast payload built before multi-swell support
  // may lack `swells`. Fall back to the legacy single-swell fields so the panel
  // always renders instead of crashing.
  const swells: SwellComponent[] =
    point.swells && point.swells.length > 0
      ? point.swells
      : point.swellHeight > 0
        ? [
            {
              kind: 'primary',
              height: point.swellHeight,
              period: point.swellPeriod,
              direction: point.swellDirection,
            },
          ]
        : []

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      {/* header */}
      <div>
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{seg.region}</p>
        <h2 className="text-pretty text-xl font-semibold text-foreground">{seg.name.replace(' area', '')}</h2>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {seg.lat.toFixed(2)}, {seg.lon.toFixed(2)} · faces {cardinal(seg.shoreNormalDeg)} ({seg.shoreNormalDeg}
          &deg;)
        </p>
      </div>

      {/* score */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-secondary/40 p-4">
        <div
          className="flex size-16 shrink-0 items-center justify-center rounded-xl font-mono text-2xl font-bold"
          style={{ backgroundColor: color, color: 'var(--ocean-deep)' }}
        >
          {score.score.toFixed(1)}
        </div>
        <div>
          <p className="text-lg font-semibold" style={{ color }}>
            {score.label}
          </p>
          <p className="text-sm text-muted-foreground">Surf quality, 0&ndash;10</p>
          {score.combo && (
            <span className="mt-1 inline-flex w-fit items-center gap-1 rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-primary">
              <Layers className="size-3" /> Combo swell
            </span>
          )}
        </div>
      </div>

      {/* swell train */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Swell train ({swells.length})
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {swells.length === 0 && (
            <div className="rounded-xl border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
              No measurable swell this hour.
            </div>
          )}
          {swells.map((sw, i) => {
            const reach = swellReach(sw.direction, seg.shoreNormalDeg)
            return (
              <div
                key={`${sw.kind}-${i}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3"
                style={{ opacity: reach.exposed ? 1 : 0.5 }}
              >
                <CompassArrow fromDeg={sw.direction} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{SWELL_LABELS[sw.kind]}</span>
                    <span className="shrink-0 font-mono text-sm text-foreground">
                      {metersToFeet(sw.height).toFixed(1)} ft
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 font-mono text-xs text-muted-foreground">
                    <span>
                      {cardinal(sw.direction)} {sw.direction}&deg; @ {sw.period.toFixed(0)}s
                    </span>
                    <span className={reach.exposed ? 'text-primary' : 'text-destructive'}>
                      {reach.exposed ? `${Math.round(reach.value * 100)}% open` : 'blocked'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {score.focusLabel && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-foreground">
            <Mountain className="size-4 shrink-0 text-primary" />
            <span>
              {score.focusLabel} &middot; {score.focus > 1 ? 'amplifies' : 'reduces'} size{' '}
              <span className="font-mono">
                {score.focus > 1 ? '+' : ''}
                {Math.round((score.focus - 1) * 100)}%
              </span>
            </span>
          </div>
        )}
      </div>

      {/* readouts */}
      <div className="grid grid-cols-2 gap-3">
        <Readout icon={<Ruler className="size-4" />} label="Wave height">
          <span className="text-lg font-semibold text-foreground">{metersToFeet(point.waveHeight).toFixed(1)} ft</span>
          <span className="font-mono text-xs text-muted-foreground">combined sea + swell</span>
        </Readout>

        <Readout icon={<Waves className="size-4" />} label="Face">
          <span className="text-lg font-semibold text-foreground">
            {metersToFeet(score.effectiveHeightM).toFixed(1)} ft
          </span>
          <span className="font-mono text-xs text-muted-foreground">exposed + seafloor</span>
        </Readout>

        <Readout icon={<Wind className="size-4" />} label="Wind">
          <div className="flex items-center gap-2 text-primary">
            <CompassArrow fromDeg={point.windDirection} size={26} />
            <span className="text-lg font-semibold text-foreground">{point.windSpeed} mph</span>
          </div>
          <WindBadge type={score.windType} />
        </Readout>

        <Readout icon={<Droplets className="size-4" />} label="Tide">
          <span className="text-lg font-semibold text-foreground">
            {point.tide == null ? '--' : `${metersToFeet(point.tide) >= 0 ? '+' : ''}${metersToFeet(point.tide).toFixed(1)} ft`}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {score.factors.find((f) => f.key === 'tide')?.detail}
          </span>
        </Readout>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Thermometer className="size-4" />
        Water {celsiusToF(point.waterTemp).toFixed(0)}&deg;F ({point.waterTemp.toFixed(0)}&deg;C)
      </div>

      {/* score breakdown */}
      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">Why this score</p>
        <div className="flex flex-col gap-2.5">
          {score.factors.map((f) => (
            <div key={f.key}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-foreground">{f.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{f.detail}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.round(f.value * 100)}%`, backgroundColor: color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* hourly / multi-day outlook */}
      <div className="mt-auto">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {mode === '24h' ? '24-hour outlook' : '5-day outlook'}
          </p>
          <div className="flex items-center rounded-md border border-border p-0.5 font-mono text-[10px] uppercase tracking-wide">
            <button
              type="button"
              aria-pressed={mode === '24h'}
              onClick={() => setMode('24h')}
              className={`rounded px-2 py-0.5 transition-colors ${mode === '24h' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              24h
            </button>
            <button
              type="button"
              aria-pressed={mode === '5day'}
              onClick={() => setMode('5day')}
              className={`rounded px-2 py-0.5 transition-colors ${mode === '5day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              5d
            </button>
          </div>
        </div>
        <div className="flex h-16 items-end gap-px" onMouseLeave={() => setHoverIndex(null)}>
          {visibleOutlook.map((o) => (
            <button
              key={o.time}
              type="button"
              title={`${hourLabel(o.time)} · ${o.score.toFixed(1)}`}
              onMouseEnter={() => setHoverIndex(o.index)}
              onFocus={() => setHoverIndex(o.index)}
              onBlur={() => setHoverIndex(null)}
              onClick={() => onSelectTime(o.index)}
              className="group relative min-w-0 flex-1 rounded-sm transition-opacity"
              style={{
                height: `${Math.max(6, o.score * 10)}%`,
                backgroundColor: colorForScore(o.score),
                opacity: o.index === activeIndex ? 1 : 0.5,
                outline: o.index === committedIndex ? '1px solid var(--foreground)' : 'none',
                outlineOffset: '1px',
              }}
            >
              <span className="sr-only">
                {hourLabel(o.time)}: {o.score.toFixed(1)}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-center font-mono text-[11px] text-muted-foreground">
          {hourLabel(point.time)} · {score.score.toFixed(1)}
          {isPreview ? ' · hover preview' : ' · selected'}
        </p>
      </div>
    </div>
  )
}

function Readout({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-secondary/40 p-3">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      {children}
    </div>
  )
}

function WindBadge({ type }: { type: SurfScore['windType'] }) {
  const styles: Record<SurfScore['windType'], string> = {
    offshore: 'bg-primary/20 text-primary',
    'cross-shore': 'bg-secondary text-muted-foreground',
    onshore: 'bg-destructive/20 text-destructive',
  }
  return (
    <span className={`w-fit rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${styles[type]}`}>
      {type}
    </span>
  )
}
