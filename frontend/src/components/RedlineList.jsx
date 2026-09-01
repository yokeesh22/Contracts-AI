import { useEffect, useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import RedlineCard from './RedlineCard'
import {
  CLASSIFICATIONS,
  countByClassification,
  metaFor,
  UNSENT_ACTIONS,
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
  { key: 'revised', label: 'Revised unasked', test: (r) => r.vendor_action === 'revised' },
  {
    key: 'no_response',
    label: 'No movement',
    test: (r) => ['rejected', 'ignored'].includes(r.vendor_action),
  },
  { key: 'accepted', label: 'They accepted', test: (r) => r.vendor_action === 'accepted' },
  {
    // Kept last and named for what it is. These never reached the counterparty,
    // so grouping them under "no movement" made every round look like the first
    // one all over again.
    key: 'not_raised',
    label: 'Not raised',
    test: (r) => r.vendor_action === 'not_raised',
  },
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
  canAdd = false,
  onAdd,
  addHint,
}) {
  // One filter at a time. Two independent dimensions meant a stale response
  // filter from another round could hide everything a classification chip was
  // meant to reveal, and the only way out was to notice a "clear" button you
  // were not looking for.
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

  // A response filter that no longer exists on this round — switching from a
  // vendor reply back to the opening paper — would otherwise silently hide
  // everything.
  useEffect(() => {
    if (!response) return
    const active = RESPONSE_FILTERS.find((f) => f.key === response)
    if (!active || !redlines.some(active.test)) setResponse(null)
  }, [response, redlines])

  const visible = useMemo(() => {
    let list = [...redlines]
    if (filter) list = list.filter((r) => r.classification === filter)
    if (response) {
      const active = RESPONSE_FILTERS.find((f) => f.key === response)
      if (active) list = list.filter(active.test)
    }
    // Points the counterparty never saw sink below the ones they acted on,
    // however severe: a round is read for what moved.
    const unsent = (r) => (UNSENT_ACTIONS.includes(r.vendor_action) ? 1 : 0)
    return list.sort(
      (a, b) =>
        unsent(a) - unsent(b) ||
        (SEVERITY_ORDER[a.classification] ?? 9) -
          (SEVERITY_ORDER[b.classification] ?? 9) ||
        a.sort_order - b.sort_order,
    )
  }, [redlines, filter, response])

  return (
    <div className="flex h-full flex-col">
      {/* One band of chrome, not three. The round is named in the header above,
          so a "Round 2 — what moved" title here only repeated it, and the total
          count was the sum of the chips beside it. What is left is the two cuts
          a reviewer actually filters on: how bad, and what moved. */}
      <div className="flex h-11 shrink-0 items-center gap-1.5 overflow-x-auto border-b bg-card px-4">
        {CLASSIFICATIONS.map((key) => {
          const meta = metaFor(key)
          const active = filter === key
          return (
            <button
              key={key}
              type="button"
              title={meta.hint}
              onClick={() => {
                setResponse(null)
                setFilter(active ? null : key)
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-medium transition-all',
                active && 'ring-2 ring-primary ring-offset-1',
                !counts[key] && 'opacity-45',
              )}
              style={{ background: meta.bg, color: meta.fg, borderColor: meta.border }}
            >
              <span className="font-mono-num tabular-nums">{counts[key] || 0}</span>
              {/* A category with nothing in it keeps its count — "0 unacceptable"
                  is good news worth seeing — but gives up its label. Naming a
                  bucket that is empty costs the same room as naming one that is
                  full, and pushes the categories that matter off the row. */}
              {Boolean(counts[key]) && meta.short}
            </button>
          )
        })}

        {isRound && (
          <>
            <span aria-hidden className="mx-1 h-4 w-px bg-border" />
            {RESPONSE_FILTERS.map((f) => {
              const count = responseCounts[f.key] || 0
              if (!count) return null
              const active = response === f.key
              const tone = VENDOR_ACTION[f.key === 'no_response' ? 'rejected' : f.key]
              return (
                <button
                  key={f.key}
                  type="button"
                  title={`${f.label} since the previous round`}
                  onClick={() => {
                    setFilter(null)
                    setResponse(active ? null : f.key)
                  }}
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
          </>
        )}

        <div className="min-w-2 flex-1" />

        {(filter || response) && (
          <button
            type="button"
            onClick={() => {
              setFilter(null)
              setResponse(null)
            }}
            title="Clear the filter"
            aria-label="Clear the filter"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
            Add redline
          </button>
        )}
      </div>

      {/* A flat divided list, not a stack of floating cards. Gaps and shadows
          around twenty items read as twenty separate things to deal with; a
          continuous list reads as one list, which is what it is. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
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
          // first finding lands, because a finding is better news than a message.
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
