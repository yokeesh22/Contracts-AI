import { ChevronDown, Loader2 } from 'lucide-react'
import RedlineCard from './RedlineCard'
import { cn } from '../lib/utils'

/**
 * The findings, as a flat divided list.
 *
 * Filtering and its chips moved out to FindingsToolbar, which shares a flex row
 * with the document pane's toolbar so the two headers are always exactly as tall
 * as each other. What is left here is the list itself: already filtered, already
 * ordered, one row per negotiating point.
 *
 * Gaps and shadows around twenty floating cards read as twenty separate things
 * to deal with; a continuous list reads as one list, which is what it is.
 */
export default function RedlineList({
  redlines = [],
  ignored = [],
  ignoredCount = 0,
  showIgnored = false,
  onToggleIgnored,
  total = 0,
  activeRedlineId,
  onSelect,
  onUpdate,
  onDelete,
  disabled = false,
  readOnly = false,
  isRunning = false,
}) {
  if (isRunning && !total) {
    // While the round is still being analysed there is nothing to say yet, so
    // the spinner stands in for the empty state. It goes as soon as the first
    // finding lands, because a finding is better news than a message.
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!redlines.length && !ignoredCount) {
    return (
      <div className="px-4 py-12 text-center text-[13px] text-muted-foreground">
        {total ? 'No findings match the current filter.' : 'No findings yet.'}
      </div>
    )
  }

  const card = (redline) => (
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
  )

  return (
    <div className="h-full overflow-y-auto">
      {redlines.map(card)}

      {!redlines.length && ignoredCount > 0 && (
        <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
          Nothing moved on this round.
        </p>
      )}

      {/* Points that never reached the counterparty: either nobody ruled on
          them, or they were rejected here. Collapsed rather than dropped —
          a decision to let something go should stay findable without twenty of
          them burying the three clauses that actually changed. */}
      {ignoredCount > 0 && (
        <>
          <button
            type="button"
            onClick={onToggleIgnored}
            aria-expanded={showIgnored}
            className="flex w-full items-center gap-2 border-b bg-secondary px-4 py-2.5 text-left text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', !showIgnored && '-rotate-90')}
            />
            {ignoredCount} previously ignored
            <span className="font-normal">
              · not sent to the counterparty, and unchanged
            </span>
          </button>
          {showIgnored && ignored.map(card)}
        </>
      )}
    </div>
  )
}
