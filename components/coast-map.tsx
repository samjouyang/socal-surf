'use client'

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { Plus, Minus, Maximize2 } from 'lucide-react'
import { COAST_SEGMENTS, type CoastSegment } from '@/lib/coastline'
import { colorForScore } from '@/lib/scoring'

export interface ScoredSegment {
  seg: CoastSegment
  score: number
}

const DEG2RAD = Math.PI / 180
const MIN_SCALE = 1
const MAX_SCALE = 12

// Landmark tags placed on the ocean side of the map, keyed by latitude.
const LANDMARK_TAGS: { label: string; lat: number }[] = [
  { label: 'HUNTINGTON', lat: 33.655 },
  { label: 'NEWPORT', lat: 33.595 },
  { label: 'LAGUNA', lat: 33.542 },
  { label: 'DANA PT', lat: 33.46 },
  { label: 'SAN CLEMENTE', lat: 33.417 },
  { label: 'OCEANSIDE', lat: 33.193 },
  { label: 'ENCINITAS', lat: 33.034 },
  { label: 'LA JOLLA', lat: 32.85 },
  { label: 'IMPERIAL BCH', lat: 32.579 },
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
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null)

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
    const leftPad = 92
    const rightPad = 46
    const topPad = 30
    const bottomPad = 30
    const w = leftPad + coastW + rightPad
    const h = topPad + H + bottomPad

    const project = (lat: number, lon: number) => ({
      x: leftPad + (lon - lonMin) * k * scale,
      y: topPad + (latMax - lat) * scale,
    })

    const pts = COAST_SEGMENTS.map((s) => ({ ...project(s.lat, s.lon), seg: s }))
    const tags = LANDMARK_TAGS.map((t) => ({ label: t.label, y: project(t.lat, lonMin).y }))
    const grid = [32.6, 32.8, 33.0, 33.2, 33.4, 33.6].map((lat) => ({ lat, y: project(lat, 0).y }))
    const centroid = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 })
    return { w, h, pts, tags, grid, centroid, edgeX: w - rightPad, project }
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

  // ---- zoom / pan ----
  function toSvgPoint(clientX: number, clientY: number) {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = new DOMPointReadOnly(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  function clampView(scale: number, tx: number, ty: number) {
    const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale))
    // Keep content from drifting entirely out of frame.
    const maxTx = 0
    const minTx = geo.w * (1 - s)
    const maxTy = 0
    const minTy = geo.h * (1 - s)
    return {
      scale: s,
      tx: Math.min(maxTx, Math.max(minTx, tx)),
      ty: Math.min(maxTy, Math.max(minTy, ty)),
    }
  }

  function zoomAt(cx: number, cy: number, factor: number) {
    setView((v) => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor))
      const ratio = next / v.scale
      return clampView(next, cx - (cx - v.tx) * ratio, cy - (cy - v.ty) * ratio)
    })
  }

  function onWheel(e: ReactWheelEvent<SVGSVGElement>) {
    e.preventDefault()
    const { x, y } = toSvgPoint(e.clientX, e.clientY)
    zoomAt(x, y, e.deltaY < 0 ? 1.15 : 1 / 1.15)
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (view.scale <= 1) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false }
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!drag.current) return
    const svg = svgRef.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    // Convert client delta to SVG units (ignore translation part of the CTM).
    const dx = (e.clientX - drag.current.x) / ctm.a
    const dy = (e.clientY - drag.current.y) / ctm.d
    if (Math.abs(e.clientX - drag.current.x) > 3 || Math.abs(e.clientY - drag.current.y) > 3) {
      drag.current.moved = true
    }
    setView((v) => clampView(v.scale, drag.current!.tx + dx, drag.current!.ty + dy))
  }

  function onPointerUp() {
    drag.current = null
  }

  function centerZoom(factor: number) {
    // Zoom toward the selected spot if there is one, otherwise the coastline's
    // center of mass — never the empty middle of the ocean.
    const sel = selectedId ? geo.pts.find((p) => p.seg.id === selectedId) : null
    const target = sel ?? geo.centroid
    zoomAt(target.x, target.y, factor)
  }

  const isZoomed = view.scale > 1

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${geo.w} ${geo.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full select-none"
        style={{ touchAction: isZoomed ? 'none' : 'auto', cursor: isZoomed ? (drag.current ? 'grabbing' : 'grab') : 'default' }}
        role="img"
        aria-label="Map of the Southern California coast colored by surf quality"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <defs>
          <linearGradient id="ocean" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--ocean-deep)" />
            <stop offset="1" stopColor="var(--ocean)" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={geo.w} height={geo.h} fill="url(#ocean)" />

        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
          {/* faint latitude gridlines */}
          {geo.grid.map((g) => (
            <line key={g.lat} x1="0" y1={g.y} x2={geo.w} y2={g.y} stroke="currentColor" strokeOpacity="0.05" strokeWidth="1" />
          ))}

          <path d={landPath} fill="var(--land)" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />

          {/* landmark tags on the ocean side */}
          {geo.tags.map((t) => (
            <text
              key={t.label}
              x="8"
              y={t.y}
              className="fill-muted-foreground font-mono"
              style={{ fontSize: 12, letterSpacing: 0.5 }}
              dominantBaseline="middle"
            >
              {t.label}
            </text>
          ))}

          {/* colored shoreline + per-segment hit targets */}
          {geo.pts.slice(0, -1).map((p, i) => {
            const next = geo.pts[i + 1]
            const s = scoreById.get(p.seg.id) ?? 0
            return (
              <g key={`edge-${p.seg.id}`}>
                <line
                  x1={p.x}
                  y1={p.y}
                  x2={next.x}
                  y2={next.y}
                  stroke={colorForScore(s)}
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <line
                  x1={p.x}
                  y1={p.y}
                  x2={next.x}
                  y2={next.y}
                  stroke="transparent"
                  strokeWidth="16"
                  strokeLinecap="round"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverId(p.seg.id)}
                  onMouseLeave={() => setHoverId((h) => (h === p.seg.id ? null : h))}
                  onClick={() => {
                    if (!drag.current?.moved) onSelect(p.seg.id)
                  }}
                />
              </g>
            )
          })}

          {/* active / selected markers only (keeps the dense line readable) */}
          {active &&
            (() => {
              const p = geo.pts.find((q) => q.seg.id === active)
              if (!p) return null
              const s = scoreById.get(p.seg.id) ?? 0
              return (
                <g pointerEvents="none">
                  {selectedId === active && (
                    <circle cx={p.x} cy={p.y} r="12" fill="none" stroke={colorForScore(s)} strokeWidth="2.5" strokeOpacity="0.9" />
                  )}
                  <circle cx={p.x} cy={p.y} r="6" fill={colorForScore(s)} stroke="var(--background)" strokeWidth="1.5" />
                </g>
              )
            })()}

          {/* hover / selected label */}
          {active &&
            (() => {
              const p = geo.pts.find((q) => q.seg.id === active)
              if (!p) return null
              const s = scoreById.get(p.seg.id) ?? 0
              const flip = p.x > geo.w - 220
              const boxX = flip ? p.x - 214 : p.x + 16
              return (
                <g pointerEvents="none">
                  <rect x={boxX} y={p.y - 22} width="198" height="44" rx="8" fill="var(--popover)" stroke="currentColor" strokeOpacity="0.15" />
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
        </g>
      </svg>

      {/* zoom controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1">
        <ZoomButton label="Zoom in" onClick={() => centerZoom(1.4)} disabled={view.scale >= MAX_SCALE}>
          <Plus className="size-4" />
        </ZoomButton>
        <ZoomButton label="Zoom out" onClick={() => centerZoom(1 / 1.4)} disabled={view.scale <= MIN_SCALE}>
          <Minus className="size-4" />
        </ZoomButton>
        <ZoomButton label="Reset view" onClick={() => setView({ scale: 1, tx: 0, ty: 0 })} disabled={view.scale === 1}>
          <Maximize2 className="size-4" />
        </ZoomButton>
      </div>
    </div>
  )
}

function ZoomButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-md border border-border bg-card/85 text-foreground backdrop-blur-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  )
}
