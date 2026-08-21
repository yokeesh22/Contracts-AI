import { cn } from '../lib/utils'

// Palette mirrors the IDP DocumentStatusBadge: tinted background, matching
// border, saturated dot — pulsing while work is in flight.
const STATUS_MAP = {
  // Extraction / session statuses
  pending:    { label: 'Pending',    bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', dot: '#f97316' },
  processing: { label: 'Processing', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', dot: '#3b82f6', blink: true },
  extracting: { label: 'Extracting', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', dot: '#3b82f6', blink: true },
  analyzing:  { label: 'Analyzing',  bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe', dot: '#8b5cf6', blink: true },
  completed:  { label: 'Completed',  bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', dot: '#22c55e' },
  failed:     { label: 'Failed',     bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', dot: '#ef4444' },

  // Requirement classifications
  COMPLIANT:            { label: 'Compliant',            bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', dot: '#22c55e' },
  ACCEPTABLE_DEVIATION: { label: 'Acceptable Deviation', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', dot: '#f97316' },
  CRITICAL_DEVIATION:   { label: 'Critical Deviation',   bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', dot: '#ef4444' },
  NOT_APPLICABLE:       { label: 'Not Applicable',       bg: '#f7f8fa', color: '#475569', border: '#e2e6ed', dot: '#94a3b8' },
}

const FALLBACK = { bg: '#f7f8fa', color: '#475569', border: '#e2e6ed', dot: '#94a3b8' }

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
