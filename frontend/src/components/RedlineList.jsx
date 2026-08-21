import { useMemo, useState } from 'react'
import { Filter, Plus } from 'lucide-react'
import RedlineCard from './RedlineCard'
import {
  CLASSIFICATIONS,
  countByClassification,
  metaFor,
} from '../lib/classifications'
import { cn } from '../lib/utils'

const SEVERITY_ORDER = {
  UNACCEPTABLE: 0,
  MISSING: 1,
  NEGOTIABLE: 2,
  ACCEPTABLE: 3,
}

/**
 * The findings pane: summary chips, filters, and the cards themselves.
 *
 * Sorted by severity rather than document order — a reviewer with limited time
 * should meet the deal-breakers first, not whatever happens to appear on page 2.
 */
export default function RedlineList({
  redlines = [],
  activeRedlineId,
  onSelect,
  onUpdate,
  onDelete,
  onAdd,
  pendingSelection,
  disabled = false,
}) {
  const [filter, setFilter] = useState(null)
  const [hideRejected, setHideRejected] = useState(false)

  const counts = useMemo(() => countByClassification(redlines), [redlines])

  const visible = useMemo(() => {
    let list = [...redlines]
    if (filter) list = list.filter((r) => r.classification === filter)
    if (hideRejected) list = list.filter((r) => r.status !== 'rejected')
    return list.sort(
      (a, b) =>
        (SEVERITY_ORDER[a.classification] ?? 9) -
          (SEVERITY_ORDER[b.classification] ?? 9) ||
        a.sort_order - b.sort_order,
    )
  }, [redlines, filter, hideRejected])

  const rejectedCount = redlines.filter((r) => r.status === 'rejected').length

  return (
    <div className="flex h-full flex-col">
      {/* Summary chips double as filters */}
      <div className="shrink-0 space-y-2.5 border-b bg-card px-4 py-3">
        <div className="flex flex-wrap gap-2">
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
        </div>

        <div className="flex items-center gap-3">
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              disabled={disabled}
              className="btn-secondary h-8 px-3 text-[13px]"
              title={
                pendingSelection
                  ? 'Add a redline on the text you selected'
                  : 'Select text in the document first, or add an unanchored point'
              }
            >
              <Plus className="h-3.5 w-3.5" />
              {pendingSelection ? 'Redline selected text' : 'Add redline'}
            </button>
          )}
          <div className="flex-1" />
          {rejectedCount > 0 && (
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-[12px] text-muted-foreground">
              <input
                type="checkbox"
                checked={hideRejected}
                onChange={(e) => setHideRejected(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--primary)]"
              />
              Hide rejected ({rejectedCount})
            </label>
          )}
          {filter && (
            <button
              type="button"
              onClick={() => setFilter(null)}
              className="flex items-center gap-1 text-[12px] text-primary hover:underline"
            >
              <Filter className="h-3 w-3" />
              Clear filter
            </button>
          )}
        </div>
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
          />
        ))}

        {!visible.length && (
          <div className="px-4 py-12 text-center text-[13px] text-muted-foreground">
            {redlines.length
              ? 'No findings match the current filter.'
              : 'No findings yet.'}
          </div>
        )}
      </div>
    </div>
  )
}
