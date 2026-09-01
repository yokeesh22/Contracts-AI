import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Handshake,
  History,
  MessageSquareQuote,
  Pencil,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import {
  metaFor,
  humaniseClauseType,
  isSettled,
  ISSUE_STATUS,
  REDLINE_STATUS,
  VENDOR_ACTION,
} from '../lib/classifications'
import { cn, scrollIntoView } from '../lib/utils'

/**
 * One negotiating point: what the clause says, what we want it to say, and —
 * from round two — what the counterparty did about it last time.
 *
 * A card rather than a table row because every finding carries five things a
 * reviewer has to read in full — original text, proposed text, rationale,
 * assessment and status. Truncating any of those into a cell defeats the point
 * of the review.
 *
 * Structure follows how a clause actually gets read: what is wrong (title and
 * severity), what happened to it last round, why it matters (rationale), what to
 * do about it (the edit), then the decision. Severity is carried by a left edge
 * stripe rather than a dot and a badge, so a reviewer can scan the column for
 * red without reading anything.
 *
 * All three editing affordances live here, because this is the only surface
 * where edits are safe: editing in the document pane would desync the block
 * anchors that clause navigation and the Word export both depend on.
 */
export default function RedlineCard({
  redline,
  isActive,
  onSelect,
  onUpdate,
  onDelete,
  disabled = false,
  readOnly = false,
}) {
  const [expanded, setExpanded] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState(redline.proposed_text || '')
  const [draftRationale, setDraftRationale] = useState(redline.rationale || '')
  const [saving, setSaving] = useState(false)
  const cardRef = useRef(null)

  const meta = metaFor(redline.classification)
  const isRejected = redline.status === 'rejected'
  const isMissing = redline.classification === 'MISSING'
  const isAnchored = redline.block_start != null
  const decided = redline.status !== 'suggested'

  const action = redline.vendor_action ? VENDOR_ACTION[redline.vendor_action] : null
  const settled = isSettled(redline.issue_status)
  // Their edits are where fresh risk enters, so a point that exists only because
  // they inserted new language is worth calling out before anything else.
  const isNew = redline.is_vendor_introduced
  // Rounds before this one, oldest first. The current round is the card itself.
  const priorRounds = (redline.history || []).filter(
    (h) => h.round < redline.round_number,
  )

  useEffect(() => {
    setDraftText(redline.proposed_text || '')
    setDraftRationale(redline.rationale || '')
  }, [redline.proposed_text, redline.rationale])

  // Keep the selected card in view when selection is driven from the document.
  // Skipped when the card is already visible: clicking a card you can see should
  // not move the list under your cursor, and a second concurrent smooth scroll
  // can cancel the document pane's own scroll to the clause.
  useEffect(() => {
    if (!isActive || !cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const parent = cardRef.current.parentElement?.getBoundingClientRect()
    if (!parent) return
    if (rect.top < parent.top || rect.bottom > parent.bottom) {
      scrollIntoView(cardRef.current, 'nearest')
    }
  }, [isActive])

  const save = async (patch) => {
    setSaving(true)
    try {
      await onUpdate(redline.id, patch)
    } finally {
      setSaving(false)
    }
  }

  const commitEdit = async () => {
    await save({ proposed_text: draftText, rationale: draftRationale })
    setEditing(false)
  }

  const cancelEdit = () => {
    setDraftText(redline.proposed_text || '')
    setDraftRationale(redline.rationale || '')
    setEditing(false)
  }

  const positions = (redline.covers?.length ? redline.covers : [redline.clause_type]).filter(
    Boolean,
  )
  const locked = disabled || readOnly || saving

  return (
    <div
      ref={cardRef}
      onClick={() => onSelect?.(redline.id)}
      className={cn(
        'group/card relative overflow-hidden rounded-xl border bg-card transition-all',
        isAnchored ? 'cursor-pointer' : 'cursor-default',
        isActive
          ? 'border-primary shadow-card-hover ring-1 ring-primary'
          : 'shadow-card hover:shadow-card-hover',
        (isRejected || settled) && 'opacity-60',
      )}
    >
      {/* Severity edge — lets the column be scanned without reading */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: meta.dot }}
      />

      <div className="pl-[15px]">
        {/* Title row */}
        <div className="flex items-start gap-3 px-3 pb-2 pt-3">
          <div className="min-w-0 flex-1">
            <h3
              className={cn(
                'text-[13.5px] font-semibold leading-snug text-foreground',
                isAnchored &&
                  'decoration-primary underline-offset-2 group-hover/card:underline',
              )}
              title={isAnchored ? 'Show this clause in the document' : undefined}
            >
              {redline.clause_title || humaniseClauseType(redline.clause_type)}
            </h3>

            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-muted-foreground">
              <span
                className="rounded px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide"
                style={{ background: meta.bg, color: meta.fg }}
                title={meta.hint}
              >
                {meta.short}
              </span>
              {isNew && (
                <span
                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide"
                  style={{ background: 'var(--brand-primary-light)', color: 'var(--primary)' }}
                  title="The counterparty added this language — it was not in the previous version"
                >
                  <Sparkles className="h-2.5 w-2.5" />
                  New
                </span>
              )}
              {redline.clause_ref && (
                <span className="font-mono-num">{redline.clause_ref}</span>
              )}
              {redline.doc_section && redline.doc_section !== 'Main Agreement' && (
                <span className="truncate">· {redline.doc_section}</span>
              )}
              {redline.page != null && (
                <span className="font-mono-num">· p.{redline.page}</span>
              )}
              {!isAnchored && <span className="italic">· not in this contract</span>}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            {action && (
              <span
                className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide"
                style={{ background: action.bg, color: action.fg }}
                title={action.hint}
              >
                {action.short}
              </span>
            )}
            {decided && <DecisionChip status={redline.status} />}
            {settled && <IssueChip status={redline.issue_status} />}
          </div>
        </div>

        {/* What they said about it, in their own words. Usually the single most
            informative thing in a returned contract. */}
        {redline.vendor_comment && (
          <div className="px-3 pb-2.5" onClick={(e) => e.stopPropagation()}>
            <div
              className="flex gap-2 rounded-md border-l-2 bg-secondary/60 px-2.5 py-2"
              style={{ borderColor: 'var(--primary)' }}
            >
              <MessageSquareQuote className="mt-[2px] h-3.5 w-3.5 shrink-0 text-primary" />
              <p className="text-[12px] leading-[1.55] text-muted-foreground">
                {redline.vendor_comment}
              </p>
            </div>
          </div>
        )}

        {/* Why it matters */}
        <div className="px-3 pb-2.5" onClick={(e) => e.stopPropagation()}>
          {editing ? (
            <>
              <FieldLabel>Rationale — becomes the margin comment in Word</FieldLabel>
              <textarea
                className="input h-auto min-h-[72px] w-full resize-y py-2 text-[12.5px] leading-relaxed"
                value={draftRationale}
                onChange={(e) => setDraftRationale(e.target.value)}
              />
            </>
          ) : (
            redline.rationale && (
              <p className="text-[12.5px] leading-[1.6] text-muted-foreground">
                {redline.rationale}
              </p>
            )
          )}
        </div>

        {/* Positions this one edit resolves. A clause routinely fails more than
            one, and they are fixed together because two edits to the same
            paragraph cannot both survive into the export. */}
        {positions.length > 0 && !editing && (
          <div className="flex flex-wrap gap-1 px-3 pb-2.5">
            {positions.map((type) => (
              <span
                key={type}
                className="rounded-full border px-2 py-0.5 text-[10.5px] text-muted-foreground"
              >
                {humaniseClauseType(type)}
              </span>
            ))}
          </div>
        )}

        {/* The thread. Without it a reviewer in round three trades away the same
            point twice, having no way to see they already conceded it once. */}
        {priorRounds.length > 0 && (
          <div onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 border-t px-3 py-2 text-left text-[12px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform', !historyOpen && '-rotate-90')}
              />
              <History className="h-3.5 w-3.5" />
              Negotiation history
              <span className="ml-auto font-mono-num text-[11px]">
                {priorRounds.length + 1} rounds
              </span>
            </button>

            {historyOpen && (
              <ol className="tab-panel-enter space-y-2 border-t bg-secondary/40 px-3 py-3">
                {priorRounds.map((entry) => (
                  <li key={entry.redline_id} className="flex gap-2.5">
                    <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted font-mono-num text-[9.5px] font-semibold text-muted-foreground">
                      {entry.round}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      {entry.our_proposal && (
                        <p className="text-[11.5px] leading-snug text-muted-foreground">
                          <span className="font-medium text-foreground">We asked: </span>
                          {truncate(entry.our_proposal)}
                        </p>
                      )}
                      {entry.vendor_action && (
                        <p className="text-[11.5px] leading-snug text-muted-foreground">
                          <span className="font-medium text-foreground">They: </span>
                          {VENDOR_ACTION[entry.vendor_action]?.label || entry.vendor_action}
                          {entry.their_text ? ` — ${truncate(entry.their_text)}` : ''}
                        </p>
                      )}
                      {entry.vendor_comment && (
                        <p className="text-[11.5px] italic leading-snug text-muted-foreground">
                          “{truncate(entry.vendor_comment, 160)}”
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {/* The edit */}
        <div onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center gap-1.5 border-t px-3 py-2 text-left text-[12px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform',
                !expanded && '-rotate-90',
              )}
            />
            {isMissing ? 'Clause to add' : 'Proposed change'}
            {!isMissing && (redline.words_added > 0 || redline.words_removed > 0) && (
              <span className="ml-auto font-mono-num text-[11px]">
                <span style={{ color: 'var(--ins-fg)' }}>+{redline.words_added}</span>{' '}
                <span style={{ color: 'var(--del-fg)' }}>−{redline.words_removed}</span>
              </span>
            )}
          </button>

          {expanded && (
            <div className="tab-panel-enter space-y-2.5 border-t bg-secondary/40 px-3 py-3">
              {!isMissing && redline.original_text && (
                <div>
                  <FieldLabel>
                    {action
                      ? 'As it now reads in the counterparty’s latest version'
                      : 'As written by the counterparty'}
                  </FieldLabel>
                  <p
                    className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-card p-2.5 text-[12px] leading-relaxed"
                    style={{ color: 'var(--del-fg)' }}
                  >
                    {redline.original_text}
                  </p>
                  {redline.proposed_text && (
                    <div className="flex justify-center py-1.5">
                      <ArrowRight className="h-3.5 w-3.5 rotate-90 text-muted-foreground/60" />
                    </div>
                  )}
                </div>
              )}

              {(redline.proposed_text || editing) && (
                <div>
                  <FieldLabel>
                    {isMissing ? 'Language to insert' : 'Our proposed wording'}
                  </FieldLabel>
                  {editing ? (
                    <textarea
                      className="input h-auto min-h-[160px] w-full resize-y py-2 text-[12px] leading-relaxed"
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      placeholder="Replacement clause text"
                    />
                  ) : (
                    <p
                      className="whitespace-pre-wrap rounded-md border p-2.5 text-[12px] leading-relaxed"
                      style={{
                        background: 'var(--ins-bg)',
                        color: 'var(--ins-fg)',
                        borderColor: 'transparent',
                      }}
                    >
                      {redline.proposed_text}
                    </p>
                  )}
                </div>
              )}

              {!redline.proposed_text && !editing && (
                <p className="text-[12px] italic text-muted-foreground">
                  No further edit — this clause now stands as written.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Decision */}
        <div
          className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          {readOnly ? (
            <span className="text-[11.5px] italic text-muted-foreground">
              A past round — open the latest to make changes.
            </span>
          ) : editing ? (
            <>
              <button
                type="button"
                className="btn-primary h-7 px-3 text-[12.5px]"
                onClick={commitEdit}
                disabled={saving}
              >
                <Check className="h-3.5 w-3.5" />
                Save
              </button>
              <button
                type="button"
                className="btn-secondary h-7 px-3 text-[12.5px]"
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancel
              </button>
            </>
          ) : settled ? (
            <Action
              label="Put this point back on the table"
              onClick={() => save({ status: 'suggested', issue_status: 'open' })}
              disabled={locked}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Reopen
            </Action>
          ) : action ? (
            // Round two onwards: the decision is about their response, not about
            // a suggestion nobody has seen yet.
            <>
              {redline.vendor_action === 'countered' && (
                <Action
                  label="Take the counterparty's wording and close this point"
                  onClick={() => save({ status: 'rejected', issue_status: 'agreed' })}
                  disabled={locked}
                  tone="accepted"
                >
                  <Handshake className="h-3.5 w-3.5" />
                  Accept theirs
                </Action>
              )}
              <Action
                label="Keep this edit in the redline going back to them"
                onClick={() => save({ status: 'accepted' })}
                disabled={locked || !redline.proposed_text}
                tone={redline.status === 'accepted' ? 'accepted' : 'default'}
              >
                <Check className="h-3.5 w-3.5" />
                Push back
              </Action>
              <Action
                label="Reword what we are asking for"
                onClick={() => {
                  setExpanded(true)
                  setEditing(true)
                }}
                disabled={locked}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Action>
              <Action
                label="Give this point up and stop raising it"
                onClick={() => save({ status: 'rejected', issue_status: 'conceded' })}
                disabled={locked}
              >
                <X className="h-3.5 w-3.5" />
                Concede
              </Action>
            </>
          ) : isRejected ? (
            <Action
              label="Restore this suggestion"
              onClick={() => save({ status: 'suggested' })}
              disabled={locked}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Restore
            </Action>
          ) : (
            <>
              <Action
                label="Keep this change in the exported redline"
                onClick={() => save({ status: 'accepted' })}
                disabled={locked}
                tone={redline.status === 'accepted' ? 'accepted' : 'default'}
              >
                <Check className="h-3.5 w-3.5" />
                Accept
              </Action>
              <Action
                label="Leave the clause exactly as the counterparty wrote it"
                onClick={() => save({ status: 'rejected' })}
                disabled={locked}
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </Action>
              <Action
                label="Reword the proposed change"
                onClick={() => {
                  setExpanded(true)
                  setEditing(true)
                }}
                disabled={locked}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Action>
            </>
          )}

          <div className="flex-1" />

          {redline.source === 'user' && (
            <span
              className="rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-medium text-accent-foreground"
              title="Added by a reviewer, not by the analysis"
            >
              Manual
            </span>
          )}
          {redline.source === 'user' && onDelete && !editing && !readOnly && (
            <Action
              label="Delete this manually added redline"
              onClick={() => onDelete(redline.id)}
              disabled={locked}
              tone="danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Action>
          )}
        </div>
      </div>
    </div>
  )
}

function truncate(text, limit = 130) {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean
}

function FieldLabel({ children }) {
  return (
    <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

function DecisionChip({ status }) {
  const meta = REDLINE_STATUS[status] || { label: status, hint: '' }
  const tone =
    status === 'accepted'
      ? { bg: 'var(--acceptable-bg)', fg: 'var(--acceptable-fg)' }
      : status === 'rejected'
      ? { bg: 'var(--muted)', fg: 'var(--muted-foreground)' }
      : { bg: 'var(--brand-primary-light)', fg: 'var(--primary)' }

  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium"
      style={{ background: tone.bg, color: tone.fg }}
      title={meta.hint}
    >
      {meta.label}
    </span>
  )
}

function IssueChip({ status }) {
  const meta = ISSUE_STATUS[status]
  if (!meta) return null
  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground"
      title="Where this negotiating point stands overall"
    >
      {meta.label}
    </span>
  )
}

function Action({ children, label, onClick, disabled, tone = 'default' }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
        tone === 'accepted' && 'bg-accent text-accent-foreground',
        tone === 'danger' && 'text-destructive hover:bg-red-50',
        tone === 'default' && 'text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
