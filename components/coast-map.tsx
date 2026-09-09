'use client'

import { useMemo, useState } from 'react'
import { COAST_SEGMENTS, type CoastSegment } from '@/lib/coastline'
import { colorForScore } from '@/lib/scoring'

export interface ScoredSegment {
  seg: CoastSegment
  score: number
}

const DEG2RAD = Math.PI / 180

// Region tags placed on the ocean side of the map.
const REGION_TAGS: { label: string; lat: number }[] = [
  { label: 'WA', lat: 47.4 },
  { label: 'OR', lat: 44.0 },
  { label: 'N.CA', lat: 40.0 },
  { label: 'C.CA', lat: 35.8 },
  { label: 'S.CA', lat: 33.3 },
]

export function CoastMap({
  scored,
  selectedId,
  onSelect,
}: {
  scored: ScoredSegment[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [hoverId, setHoverId] = useState<string | null>(null)

  const geo = useMemo(() => {
    const lats = COAST_SEGMENTS.map((s) => s.lat)
    const lons = COAST_SEGMENTS.map((s) => s.lon)
    const latMin = Math.min(...lats)
    const latMax = Math.max(...lats)
    const lonMin = Math.min(...lons)
    const lonMax = Math.max(...lons)
    const k = Math.cos(((latMin + latMax) / 2) * DEG2RAD)

    const H = 900
    const scale = H / (latMax - latMin)
    const coastW = (lonMax - lonMin) * k * scale
    const leftPad = 66
    const rightPad = 50
    const topPad = 26
    const bottomPad = 26
    const w = leftPad + coastW + rightPad
    const h = topPad + H + bottomPad

    const project = (lat: number, lon: number) => ({
      x: leftPad + (lon - lonMin) * k * scale,
      y: topPad + (latMax - lat) * scale,
    })

    const pts = COAST_SEGMENTS.map((s) => ({ ...project(s.lat, s.lon), seg: s }))
    const tags = REGION_TAGS.map((t) => ({ label: t.label, y: project(t.lat, lonMin).y }))
    return { w, h, pts, tags, edgeX: w - rightPad, project }
  }, [])

  const scoreById = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of scored) m.set(s.seg.id, s.score)
    return m
  }, [scored])

  // Land polygon: down the coast, then cap off to the eastern edge.
  const landPath = useMemo(() => {
    if (!geo.pts.length) return ''
    const first = geo.pts[0]
    const last = geo.pts[geo.pts.length - 1]
    const body = geo.pts.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${body} L ${geo.edgeX.toFixed(1)} ${last.y.toFixed(1)} L ${geo.edgeX.toFixed(1)} ${first.y.toFixed(1)} Z`
  }, [geo])

  const active = hoverId ?? selectedId

  return (
    <svg
      viewBox={`0 0 ${geo.w} ${geo.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full touch-none select-none"
      role="img"
      aria-label="Map of the US West Coast colored by surf quality"
    >
      <defs>
        <linearGradient id="ocean" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--ocean-deep)" />
          <stop offset="1" stopColor="var(--ocean)" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width={geo.w} height={geo.h} fill="url(#ocean)" />

      {/* faint latitude gridlines */}
      {[34, 36, 38, 40, 42, 44, 46].map((lat) => {
        const y = geo.project(lat, 0).y
        return (
          <line
            key={lat}
            x1="0"
            y1={y}
            x2={geo.w}
            y2={y}
            stroke="currentColor"
            strokeOpacity="0.05"
            strokeWidth="1"
          />
        )
      })}

      <path d={landPath} fill="var(--land)" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />

      {/* region tags on the ocean side */}
      {geo.tags.map((t) => (
        <text
          key={t.label}
          x="8"
          y={t.y}
          className="fill-muted-foreground font-mono"
          style={{ fontSize: 13, letterSpacing: 1 }}
          dominantBaseline="middle"
        >
          {t.label}
        </text>
      ))}

      {/* colored shoreline: one stroke per gap between consecutive points */}
      {geo.pts.slice(0, -1).map((p, i) => {
        const next = geo.pts[i + 1]
        const s = scoreById.get(p.seg.id) ?? 0
        return (
          <line
            key={`edge-${p.seg.id}`}
            x1={p.x}
            y1={p.y}
            x2={next.x}
            y2={next.y}
            stroke={colorForScore(s)}
            strokeWidth="6"
            strokeLinecap="round"
          />
        )
      })}

      {/* interactive markers */}
      {geo.pts.map((p) => {
        const s = scoreById.get(p.seg.id) ?? 0
        const isActive = active === p.seg.id
        const isSelected = selectedId === p.seg.id
        return (
          <g key={p.seg.id}>
            {isSelected && (
              <circle cx={p.x} cy={p.y} r="14" fill="none" stroke={colorForScore(s)} strokeWidth="2.5" strokeOpacity="0.9" />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={isActive ? 8 : 4.5}
              fill={colorForScore(s)}
              stroke="var(--background)"
              strokeWidth="1.5"
            />
            {/* generous transparent hit target */}
            <circle
              cx={p.x}
              cy={p.y}
              r="12"
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoverId(p.seg.id)}
              onMouseLeave={() => setHoverId((h) => (h === p.seg.id ? null : h))}
              onClick={() => onSelect(p.seg.id)}
            />
          </g>
        )
      })}

      {/* hover label */}
      {active &&
        (() => {
          const p = geo.pts.find((q) => q.seg.id === active)
          if (!p) return null
          const s = scoreById.get(p.seg.id) ?? 0
          const flip = p.x > geo.w - 220
          const boxX = flip ? p.x - 214 : p.x + 16
          return (
            <g pointerEvents="none">
              <rect
                x={boxX}
                y={p.y - 22}
                width="198"
                height="44"
                rx="8"
                fill="var(--popover)"
                stroke="currentColor"
                strokeOpacity="0.15"
              />
              <circle cx={boxX + 22} cy={p.y} r="9" fill={colorForScore(s)} />
              <text x={boxX + 40} y={p.y - 2} className="fill-foreground" style={{ fontSize: 15, fontWeight: 600 }}>
                {p.seg.name.replace(' area', '')}
              </text>
              <text x={boxX + 40} y={p.y + 15} className="fill-muted-foreground font-mono" style={{ fontSize: 13 }}>
                {s.toFixed(1)} / 10
              </text>
            </g>
          )
        })()}
    </svg>
  )
}
