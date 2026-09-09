'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  ZoomControl,
  AttributionControl,
  useMap,
} from 'react-leaflet'
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { COAST_SEGMENTS } from '@/lib/coastline'
import { colorForScore } from '@/lib/scoring'
import type { ScoredSegment } from './coast-map'

const COAST_BOUNDS: LatLngBoundsExpression = (() => {
  const lats = COAST_SEGMENTS.map((s) => s.lat)
  const lons = COAST_SEGMENTS.map((s) => s.lon)
  return [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ]
})()

// Keep the selected spot in view without yanking the map while the user pans.
function RecenterOnSelect({ latlng }: { latlng: LatLngExpression | null }) {
  const map = useMap()
  useEffect(() => {
    if (!latlng) return
    if (!map.getBounds().contains(latlng)) {
      map.panTo(latlng, { animate: true })
    }
  }, [latlng, map])
  return null
}

// Leaflet measures its container on init; if the layout is still settling (or
// the responsive column/row layout later changes the box) the map renders
// blank until told to re-measure. This keeps it in sync with its container.
function KeepSized() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const refit = () => {
      map.invalidateSize()
      map.fitBounds(COAST_BOUNDS, { padding: [28, 28] })
    }
    const t = setTimeout(refit, 60)
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => {
      clearTimeout(t)
      ro.disconnect()
    }
  }, [map])
  return null
}

export default function CoastMapInner({
  scored,
  selectedId,
  onSelect,
}: {
  scored: ScoredSegment[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [hoverId, setHoverId] = useState<string | null>(null)

  const scoreById = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of scored) m.set(s.seg.id, s.score)
    return m
  }, [scored])

  const activeId = hoverId ?? selectedId
  const activeSeg = activeId ? COAST_SEGMENTS.find((s) => s.id === activeId) ?? null : null
  const activeScore = activeId ? scoreById.get(activeId) ?? 0 : 0

  return (
    <MapContainer
      bounds={COAST_BOUNDS}
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom
      className="h-full w-full bg-[var(--ocean-deep)]"
      style={{ background: 'var(--ocean-deep)' }}
    >
      <KeepSized />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        subdomains="abc"
        maxZoom={19}
      />

      {COAST_SEGMENTS.slice(0, -1).map((seg, i) => {
        const next = COAST_SEGMENTS[i + 1]
        const s = scoreById.get(seg.id) ?? 0
        const positions: LatLngExpression[] = [
          [seg.lat, seg.lon],
          [next.lat, next.lon],
        ]
        return (
          <Polyline
            key={seg.id}
            positions={positions}
            pathOptions={{ color: colorForScore(s), weight: 5, opacity: 0.95, lineCap: 'round' }}
            eventHandlers={{
              click: () => onSelect(seg.id),
              mouseover: (e) => {
                setHoverId(seg.id)
                e.target.setStyle({ weight: 9, opacity: 1 })
                e.target.bringToFront()
              },
              mouseout: (e) => {
                setHoverId((h) => (h === seg.id ? null : h))
                e.target.setStyle({ weight: 5, opacity: 0.95 })
              },
            }}
          />
        )
      })}

      {activeSeg && (
        <CircleMarker
          center={[activeSeg.lat, activeSeg.lon]}
          radius={7}
          pathOptions={{
            color: 'var(--background)',
            weight: 2,
            fillColor: colorForScore(activeScore),
            fillOpacity: 1,
          }}
          eventHandlers={{ click: () => onSelect(activeSeg.id) }}
        >
          <Tooltip direction="right" offset={[8, 0]} opacity={1}>
            <span style={{ fontWeight: 600 }}>{activeSeg.name.replace(' area', '')}</span>
            {' — '}
            {activeScore.toFixed(1)} / 10
          </Tooltip>
        </CircleMarker>
      )}

      <RecenterOnSelect latlng={activeSeg ? [activeSeg.lat, activeSeg.lon] : null} />
      <ZoomControl position="bottomright" />
      <AttributionControl
        position="bottomleft"
        prefix={false}
      />
      <AttributionText />
    </MapContainer>
  )
}

// Register tile attribution once so OpenStreetMap is credited.
function AttributionText() {
  const map = useMap()
  useEffect(() => {
    const ctrl = map.attributionControl
    if (!ctrl) return
    const html = '&copy; OpenStreetMap contributors'
    ctrl.addAttribution(html)
    return () => {
      ctrl.removeAttribution(html)
    }
  }, [map])
  return null
}
