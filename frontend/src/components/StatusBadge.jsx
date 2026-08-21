import { CLASSIFICATION_META } from '../lib/classifications'
import { cn } from '../lib/utils'

// Tinted background, matching border, saturated dot — pulsing while work is in
// flight. Classification colours come from the shared tokens so badges, chips
// and the document pane cannot drift apart.
const STATUS_MAP = {
  pending: { label: 'Pending', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', dot: '#f97316' },
  extracting: { label: 'Extracting', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', dot: '#3b82f6', blink: true },
  analyzing: { label: 'Reviewing', bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe', dot: '#8b5cf6', blink: true },
  completed: { label: 'Completed', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', dot: '#22c55e' },
  failed: { label: 'Failed', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', dot: '#ef4444' },

  ...Object.fromEntries(
    Object.entries(CLASSIFICATION_META).map(([key, meta]) => [
      key,
      { label: meta.label, bg: meta.bg, color: meta.fg, border: meta.border, dot: meta.dot },
    ]),
  ),
}

const FALLBACK = {
  bg: 'var(--muted)',
  color: 'var(--muted-foreground)',
  border: 'var(--border)',
  dot: 'var(--muted-foreground)',
}

export default function StatusBadge({ status, className }) {
  const s = STATUS_MAP[status] ?? { ...FALLBACK, label: status }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium',
        className,
      )}
      style={{ background: s.bg, color: s.color, borderColor: s.border }}
    >
      <span
        className={cn('h-[6px] w-[6px] flex-shrink-0 rounded-full', s.blink && 'animate-pulse')}
        style={{ background: s.dot }}
      />
      {s.label}
    </span>
  )
}
