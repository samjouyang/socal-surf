'use client'

import dynamic from 'next/dynamic'
import { Waves } from 'lucide-react'
import type { CoastSegment } from '@/lib/coastline'

export interface ScoredSegment {
  seg: CoastSegment
  score: number
}

const CoastMapInner = dynamic(() => import('./coast-map-inner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[var(--ocean-deep)]">
      <Waves className="size-6 animate-pulse text-primary" />
    </div>
  ),
})

export function CoastMap(props: {
  scored: ScoredSegment[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  // Fill via absolute inset-0 so the map always has a definite height, even
  // when the parent only sets a min-height (e.g. the stacked mobile layout).
  return (
    <div className="absolute inset-0">
      <CoastMapInner {...props} />
    </div>
  )
}
