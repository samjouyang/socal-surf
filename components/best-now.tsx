'use client'

import { colorForScore, scoreLabel } from '@/lib/scoring'
import type { ScoredSegment } from './coast-map'

export function BestNow({
  scored,
  selectedId,
  onSelect,
  horizontal = false,
}: {
  scored: ScoredSegment[]
  selectedId: string | null
  onSelect: (id: string) => void
  horizontal?: boolean
}) {
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 6)

  if (horizontal) {
    return (
      <div className="flex h-full flex-col gap-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Firing right now</p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {top.map((s, i) => {
            const isSelected = s.seg.id === selectedId
            return (
              <button
                key={s.seg.id}
                type="button"
                onClick={() => onSelect(s.seg.id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                  isSelected ? 'border-primary bg-secondary/60' : 'border-border hover:bg-secondary/40'
                }`}
              >
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-md font-mono text-sm font-bold"
                  style={{ backgroundColor: colorForScore(s.score), color: 'var(--ocean-deep)' }}
                >
                  {s.score.toFixed(1)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {s.seg.name.replace(' area', '')}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    #{i + 1} · {scoreLabel(s.score)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Firing right now</p>
      <div className="flex flex-col gap-1.5">
        {top.map((s, i) => {
          const isSelected = s.seg.id === selectedId
          return (
            <button
              key={s.seg.id}
              type="button"
              onClick={() => onSelect(s.seg.id)}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                isSelected ? 'border-primary bg-secondary/60' : 'border-border hover:bg-secondary/40'
              }`}
            >
              <span className="w-4 font-mono text-xs text-muted-foreground">{i + 1}</span>
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-md font-mono text-sm font-bold"
                style={{ backgroundColor: colorForScore(s.score), color: 'var(--ocean-deep)' }}
              >
                {s.score.toFixed(1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {s.seg.name.replace(' area', '')}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {s.seg.region} · {scoreLabel(s.score)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
