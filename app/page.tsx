'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { Waves, TriangleAlert } from 'lucide-react'
import { COAST_SEGMENTS } from '@/lib/coastline'
import type { ForecastResponse } from '@/lib/forecast-types'
import { scoreSurf } from '@/lib/scoring'
import { getNowIndex } from '@/lib/format'
import { CoastMap, type ScoredSegment } from '@/components/coast-map'
import { SegmentDetail } from '@/components/segment-detail'
import { TimeControls } from '@/components/time-controls'
import { BestNow } from '@/components/best-now'
import { QualityLegend } from '@/components/quality-legend'

const SEG_BY_ID = new Map(COAST_SEGMENTS.map((s) => [s.id, s]))

const fetcher = async (url: string): Promise<ForecastResponse> => {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${res.status})`)
  }
  return res.json()
}

export default function Page() {
  const { data, error, isLoading } = useSWR<ForecastResponse>('/api/forecast', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 15 * 60 * 1000,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [timeIndex, setTimeIndex] = useState<number | null>(null)
  const didInit = useRef(false)

  const times = data?.times ?? []
  const nowIndex = useMemo(() => getNowIndex(times), [times])
  const idx = timeIndex ?? nowIndex

  const hoursById = useMemo(() => {
    const m = new Map<string, ForecastResponse['segments'][number]['hours']>()
    for (const s of data?.segments ?? []) m.set(s.id, s.hours)
    return m
  }, [data])

  const scored: ScoredSegment[] = useMemo(() => {
    if (!data) return []
    const out: ScoredSegment[] = []
    for (const seg of COAST_SEGMENTS) {
      const point = hoursById.get(seg.id)?.[idx]
      if (!point) continue
      out.push({ seg, score: scoreSurf(point, seg.shoreNormalDeg).score })
    }
    return out
  }, [data, hoursById, idx])

  useEffect(() => {
    if (!didInit.current && scored.length) {
      const best = [...scored].sort((a, b) => b.score - a.score)[0]
      setSelectedId(best.seg.id)
      didInit.current = true
    }
  }, [scored])

  const detail = useMemo(() => {
    if (!selectedId) return null
    const seg = SEG_BY_ID.get(selectedId)
    const hrs = hoursById.get(selectedId)
    const point = hrs?.[idx]
    if (!seg || !hrs || !point) return null
    const score = scoreSurf(point, seg.shoreNormalDeg)
    const outlook = hrs.map((p) => ({ time: p.time, score: scoreSurf(p, seg.shoreNormalDeg).score }))
    return { seg, point, score, outlook }
  }, [selectedId, hoursById, idx])

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Waves className="size-5" />
          </span>
          <div>
            <h1 className="font-mono text-sm font-bold uppercase tracking-widest text-foreground">Swellline</h1>
            <p className="text-[11px] leading-none text-muted-foreground">Southern California surf forecast</p>
          </div>
        </div>
        <p className="ml-auto max-w-md text-pretty text-xs text-muted-foreground">
          Huntington Beach to Imperial Beach, every ~0.4 miles scored 0&ndash;10 from modeled swell, wind and tide
          against the coast&apos;s orientation.
        </p>
      </header>

      {isLoading && <LoadingState />}
      {error && <ErrorState message={(error as Error).message} />}

      {data && (
        <div className="flex flex-1 flex-col gap-3 p-3 md:min-h-0">
          {/* Controls + best-now, full width */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
            <div className="rounded-xl border border-border bg-card px-4 py-3 lg:w-[420px] lg:shrink-0">
              <TimeControls times={times} index={idx} onIndexChange={setTimeIndex} nowIndex={nowIndex} />
            </div>
            <div className="min-w-0 flex-1 rounded-xl border border-border bg-card px-4 py-3">
              <BestNow scored={scored} selectedId={selectedId} onSelect={setSelectedId} horizontal />
            </div>
          </div>

          {/* Map + detail */}
          <div className="flex flex-1 flex-col gap-3 md:min-h-0 md:flex-row">
            <div className="relative min-h-[440px] overflow-hidden rounded-xl border border-border bg-card md:min-h-0 md:w-[300px] md:shrink-0">
              <CoastMap scored={scored} selectedId={selectedId} onSelect={setSelectedId} />
              <div className="absolute bottom-3 left-3 right-3 rounded-lg border border-border bg-card/85 px-3 py-2 backdrop-blur-sm">
                <QualityLegend />
              </div>
            </div>

            <div className="min-h-0 w-full flex-1 overflow-hidden rounded-xl border border-border bg-card">
              {detail ? (
                <SegmentDetail
                  seg={detail.seg}
                  point={detail.point}
                  score={detail.score}
                  outlook={detail.outlook}
                  currentIndex={idx}
                  onSelectTime={setTimeIndex}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
                  Select a stretch of coast on the map to see its forecast.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-border px-5 py-2 text-[11px] text-muted-foreground">
        Wave, wind &amp; tide data via{' '}
        <a href="https://open-meteo.com" className="underline hover:text-foreground" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{' '}
        (NOAA/ECMWF models). Scores are a physics-informed estimate, not a guarantee &mdash; always check conditions
        before you paddle out.
      </footer>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Waves className="size-8 animate-pulse text-primary" />
        <p className="font-mono text-sm">Pulling the latest swell, wind &amp; tide&hellip;</p>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <TriangleAlert className="size-8 text-destructive" />
        <p className="text-sm text-foreground">Could not load the forecast.</p>
        <p className="font-mono text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
