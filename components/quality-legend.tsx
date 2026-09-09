import { colorForScore } from '@/lib/scoring'

const TICKS = [1, 3, 5, 7, 9]

export function QualityLegend() {
  const gradient = Array.from({ length: 11 }, (_, i) => colorForScore(i)).join(', ')
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Flat
      </span>
      <div className="relative h-2.5 w-32 shrink-0 overflow-hidden rounded-full sm:w-40">
        <div className="absolute inset-0" style={{ background: `linear-gradient(to right, ${gradient})` }} />
      </div>
      <span className="font-mono text-[10px] uppercase tracking-wider text-primary">Epic</span>
    </div>
  )
}

export { TICKS }
