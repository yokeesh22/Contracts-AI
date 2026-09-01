import { Plus, X } from 'lucide-react'
import { metaFor } from '../lib/classifications'
import { SEVERITY_FILTERS, countBy, hasResponses } from '../lib/findings'
import { cn } from '../lib/utils'

// From round two, severity stops being four buckets and becomes one question.
const ROUND_TONES = {
  critical: { bg: 'var(--unacceptable-bg)', fg: 'var(--unacceptable-fg)', border: 'var(--unacceptable-border)' },
  non_critical: { bg: 'var(--muted)', fg: 'var(--muted-foreground)', border: 'var(--border)' },
}

/**
 * The findings filter bar.
 *
 * Severity is the only question it asks. What the counterparty did to each
 * point is on the point itself, in words, and a second row of chips repeating
 * those words turned the one number that matters — how many critical items are
 * left — into something you had to hunt for.
 *
 * Lives outside the findings pane so it can share a flex row with the document
 * pane's toolbar: the two sit side by side and have to be exactly as tall as
 * each other, and the only way to guarantee that at every width is to let one
 * row stretch both. Syncing heights in JavaScript was the first attempt, and it
 * only equalised at the widths it happened to be measured at.
 */
export default function FindingsToolbar({
  redlines = [],
  severity,
  setSeverity,
  canAdd = false,
  onAdd,
  addHint,
}) {
  const isRound = hasResponses(redlines)
  const severityFilters = isRound ? SEVERITY_FILTERS.rounds : SEVERITY_FILTERS.triage
  const severityCounts = countBy(redlines, severityFilters)

  return (
    <>
      {severityFilters.map((f) => {
        const active = severity === f.key
        const meta = isRound ? ROUND_TONES[f.key] : metaFor(f.key)
        const label = isRound ? f.label : meta.short
        const count = severityCounts[f.key] || 0
        return (
          <button
            key={f.key}
            type="button"
            title={isRound ? `${f.label} findings in this round` : meta.hint}
            onClick={() => setSeverity(active ? null : f.key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-medium transition-all',
              active && 'ring-2 ring-primary ring-offset-1',
              !count && 'opacity-45',
            )}
            style={{ background: meta.bg, color: meta.fg, borderColor: meta.border }}
          >
            <span className="font-mono-num tabular-nums">{count}</span>
            {/* A category with nothing in it keeps its count — "0 critical" is
                good news worth seeing — but gives up its label. */}
            {Boolean(count) && label}
          </button>
        )
      })}

      <div className="min-w-2 flex-1" />

      {severity && (
        <button
          type="button"
          onClick={() => setSeverity(null)}
          title="Clear the filter"
          aria-label="Clear the filter"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          title={addHint}
          className="btn-secondary h-7 shrink-0 whitespace-nowrap px-2.5 text-[12px]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add redline
        </button>
      )}
    </>
  )
}
