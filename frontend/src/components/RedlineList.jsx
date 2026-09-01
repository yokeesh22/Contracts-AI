import { useMemo, useState } from 'react'
import { Filter, Loader2 } from 'lucide-react'
import RedlineCard from './RedlineCard'
import {
  CLASSIFICATIONS,
  countByClassification,
  metaFor,
  VENDOR_ACTION,
} from '../lib/classifications'
import { cn } from '../lib/utils'

const SEVERITY_ORDER = {
  UNACCEPTABLE: 0,
  MISSING: 1,
  NEGOTIABLE: 2,
  ACCEPTABLE: 3,
}

// What a reviewer opening round two actually wants to triage, in the order they
// want it: language the counterparty introduced, points they moved on, and
// points they ignored.
const RESPONSE_FILTERS = [
  { key: 'new', label: 'New from vendor', test: (r) => r.is_vendor_introduced },
  { key: 'countered', label: 'Countered', test: (r) => r.vendor_action === 'countered' },
  {
    key: 'no_response',
    label: 'No movement',
    test: (r) => ['rejected', 'ignored'].includes(r.vendor_action),
  },
  { key: 'accepted', label: 'They accepted', test: (r) => r.vendor_action === 'accepted' },
]

/**
 * The findings pane: summary chips, filters, and the cards themselves.
 *
 * Sorted by severity rather than document order — a reviewer with limited time
 * should meet the deal-breakers first, not whatever happens to appear on page 2.
 *
 * From round two a second row of filters appears, cutting by what the
 * counterparty did rather than by how bad the clause is. That is the question
 * being asked at that point: not "what is wrong with this contract" but "what
 * moved since I last looked".
 */
export default function RedlineList({
  redlines = [],
  activeRedlineId,
  onSelect,
  onUpdate,
  onDelete,
  disabled = false,
  readOnly = false,
  isRunning = false,
}) {
  const [filter, setFilter] = useState(null)
  const [response, setResponse] = useState(null)

  const counts = useMemo(() => countByClassification(redlines), [redlines])
  const isRound = redlines.some((r) => r.vendor_action || r.is_vendor_introduced)

  const responseCounts = useMemo(
    () =>
      Object.fromEntries(
        RESPONSE_FILTERS.map((f) => [f.key, redlines.filter(f.test).length]),
      ),
    [redlines],
  )

  const visible = useMemo(() => {
    let list = [...redlines]
    if (filter) list = list.filter((r) => r.classification === filter)
    if (response) {
      const active = RESPONSE_FILTERS.find((f) => f.key === response)
      if (active) list = list.filter(active.test)
    }
    return list.sort(
      (a, b) =>
        (SEVERITY_ORDER[a.classification] ?? 9) -
          (SEVERITY_ORDER[b.classification] ?? 9) ||
        a.sort_order - b.sort_order,
    )
  }, [redlines, filter, response])

  return (
    <div className="flex h-full flex-col">
      {/* Summary chips double as filters */}
      <div className="shrink-0 space-y-2 border-b bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {CLASSIFICATIONS.map((key) => {
            const meta = metaFor(key)
            const active = filter === key
            return (
              <button
                key={key}
                type="button"
                title={meta.hint}
                onClick={() => setFilter(active ? null : key)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all',
                  active && 'ring-2 ring-primary ring-offset-1',
                )}
                style={{
                  background: meta.bg,
                  color: meta.fg,
                  borderColor: meta.border,
                }}
              >
                <span className="font-mono-num text-base tabular-nums">
                  {counts[key] || 0}
                </span>
                <span>{meta.short}</span>
              </button>
            )
          })}

          <div className="flex-1" />

          {(filter || response) && (
            <button
              type="button"
              onClick={() => {
                setFilter(null)
                setResponse(null)
              }}
              className="flex items-center gap-1 whitespace-nowrap text-[12px] text-primary hover:underline"
            >
              <Filter className="h-3 w-3" />
              Clear filter
            </button>
          )}
        </div>

        {isRound && (
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
            <span className="mr-0.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
              Since last round
            </span>
            {RESPONSE_FILTERS.map((f) => {
              const count = responseCounts[f.key] || 0
              if (!count) return null
              const active = response === f.key
              const tone = VENDOR_ACTION[f.key === 'no_response' ? 'rejected' : f.key]
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setResponse(active ? null : f.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-medium transition-all',
                    active && 'ring-2 ring-primary ring-offset-1',
                  )}
                  style={
                    tone
                      ? { background: tone.bg, color: tone.fg, borderColor: 'transparent' }
                      : undefined
                  }
                >
                  <span className="font-mono-num tabular-nums">{count}</span>
                  {f.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
        {visible.map((redline) => (
          <RedlineCard
            key={redline.id}
            redline={redline}
            isActive={redline.id === activeRedlineId}
            onSelect={onSelect}
            onUpdate={onUpdate}
            onDelete={onDelete}
            disabled={disabled}
            readOnly={readOnly}
          />
        ))}

        {!visible.length &&
          // While the round is still being analysed there is nothing to say yet,
          // so the spinner stands in for the empty state. It goes as soon as the
          // first finding lands, because a card is better news than a message.
          (isRunning && !redlines.length ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="px-4 py-12 text-center text-[13px] text-muted-foreground">
              {redlines.length
                ? 'No findings match the current filter.'
                : 'No findings yet.'}
            </div>
          ))}
      </div>
    </div>
  )
}
