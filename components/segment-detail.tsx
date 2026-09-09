'use client'

import { Waves, Wind, Droplets, Thermometer, Navigation, Ruler } from 'lucide-react'
import type { CoastSegment } from '@/lib/coastline'
import type { HourlyPoint } from '@/lib/forecast-types'
import { type SurfScore, colorForScore } from '@/lib/scoring'
import { cardinal, celsiusToF, hourLabel, metersToFeet } from '@/lib/format'
import { CompassArrow } from './compass-arrow'

export interface OutlookPoint {
  time: string
  score: number
}

export function SegmentDetail({
  seg,
  point,
  score,
  outlook,
  currentIndex,
  onSelectTime,
}: {
  seg: CoastSegment
  point: HourlyPoint
  score: SurfScore
  outlook: OutlookPoint[]
  currentIndex: number
  onSelectTime: (i: number) => void
}) {
  const color = colorForScore(score.score)

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
        </div>
      </div>

      {/* readouts */}
      <div className="grid grid-cols-2 gap-3">
        <Readout icon={<Waves className="size-4" />} label="Swell">
          <span className="text-lg font-semibold text-foreground">{metersToFeet(point.swellHeight).toFixed(1)} ft</span>
          <span className="font-mono text-xs text-muted-foreground">@ {point.swellPeriod.toFixed(0)}s</span>
        </Readout>

        <Readout icon={<Ruler className="size-4" />} label="Wave height">
          <span className="text-lg font-semibold text-foreground">{metersToFeet(point.waveHeight).toFixed(1)} ft</span>
          <span className="font-mono text-xs text-muted-foreground">combined sea + swell</span>
        </Readout>

        <Readout icon={<Navigation className="size-4" />} label="Swell dir">
          <div className="flex items-center gap-2 text-primary">
            <CompassArrow fromDeg={point.swellDirection} size={26} />
            <span className="text-lg font-semibold text-foreground">{cardinal(point.swellDirection)}</span>
          </div>
          <span className="font-mono text-xs text-muted-foreground">{point.swellDirection}&deg;</span>
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

      {/* multi-day outlook */}
      <div className="mt-auto">
        <p className="mb-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">5-day outlook</p>
        <div className="flex h-16 items-end gap-px">
          {outlook.map((o, i) => (
            <button
              key={o.time}
              type="button"
              title={`${hourLabel(o.time)} · ${o.score.toFixed(1)}`}
              onClick={() => onSelectTime(i)}
              className="group relative flex-1 rounded-sm transition-opacity hover:opacity-100"
              style={{
                height: `${Math.max(6, o.score * 10)}%`,
                backgroundColor: colorForScore(o.score),
                opacity: i === currentIndex ? 1 : 0.55,
                outline: i === currentIndex ? '1px solid var(--foreground)' : 'none',
              }}
            >
              <span className="sr-only">
                {hourLabel(o.time)}: {o.score.toFixed(1)}
              </span>
            </button>
          ))}
        </div>
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
