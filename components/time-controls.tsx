'use client'

import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, LocateFixed } from 'lucide-react'
import { dayLabel, hourLabel, isoDate } from '@/lib/format'

export function TimeControls({
  times,
  index,
  onIndexChange,
  nowIndex,
}: {
  times: string[]
  index: number
  onIndexChange: (i: number) => void
  nowIndex: number
}) {
  const days = useMemo(() => {
    const seen = new Map<string, number>()
    times.forEach((t, i) => {
      const d = isoDate(t)
      if (!seen.has(d)) seen.set(d, i)
    })
    return Array.from(seen.entries()).map(([date, startIndex]) => ({ date, startIndex }))
  }, [times])

  const currentDate = times[index] ? isoDate(times[index]) : ''

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {days.map((d) => {
          const isActive = d.date === currentDate
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onIndexChange(Math.min(d.startIndex + 12, times.length - 1))}
              className={`rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent'
              }`}
            >
              {dayLabel(times[d.startIndex])}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => onIndexChange(nowIndex)}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <LocateFixed className="size-3.5" />
          Now
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Previous hour"
          onClick={() => onIndexChange(Math.max(0, index - 1))}
          className="rounded-md bg-secondary p-1.5 text-secondary-foreground transition-colors hover:bg-accent"
        >
          <ChevronLeft className="size-4" />
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, times.length - 1)}
          value={index}
          onChange={(e) => onIndexChange(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
          aria-label="Forecast time"
        />
        <button
          type="button"
          aria-label="Next hour"
          onClick={() => onIndexChange(Math.min(times.length - 1, index + 1))}
          className="rounded-md bg-secondary p-1.5 text-secondary-foreground transition-colors hover:bg-accent"
        >
          <ChevronRight className="size-4" />
        </button>
        <span className="w-20 text-right font-mono text-sm tabular-nums text-foreground">
          {times[index] ? hourLabel(times[index]) : '--'}
        </span>
      </div>
    </div>
  )
}
