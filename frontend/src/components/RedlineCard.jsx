import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  Check,
  ChevronDown,
  Handshake,
  MessageSquareQuote,
  Pencil,
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
 * One negotiating point: a two-line row until you open it, then everything.
 *
 * It used to be a card that showed its rationale, its clause types and two
 * disclosure bars whether or not you cared about it — so twenty findings filled
 * the column three times over, and the deal-breakers looked exactly like the
 * settled ones. Half a screen cannot show twenty things in full, and pretending
 * otherwise is what made the pane unreadable.
 *
 * So a row carries only what decides whether to open it: severity, clause, what
 * the counterparty did, and whether you have already ruled on it. Opening one
 * closes the last, because the open finding is also the clause the document pane
 * has scrolled to — one at a time is all the left half can show anyway.
 *
 * All editing lives here. Editing in the document pane would desync the block
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
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState(redline.proposed_text || '')
  const [draftRationale, setDraftRationale] = useState(redline.rationale || '')
  const [saving, setSaving] = useState(false)
  const rowRef = useRef(null)

  const meta = metaFor(redline.classification)
  const action = redline.vendor_action ? VENDOR_ACTION[redline.vendor_action] : null
  const settled = isSettled(redline.issue_status)
  const isMissing = redline.classification === 'MISSING'
  const isAnchored = redline.block_start != null
  const decided = redline.status !== 'suggested'
  const locked = disabled || readOnly || saving

  // Buttons start neutral and only take colour once they are the decision on
  // record. A permanently blue "Accept" reads as already-accepted, which is the
  // one thing a reviewer must never have to second-guess.
  const chose = {
    accept: redline.status === 'accepted',
    reject: redline.status === 'rejected' && !settled,
    acceptTheirs: redline.status === 'rejected' && redline.issue_status === 'agreed',
    concede: redline.status === 'rejected' && redline.issue_status === 'conceded',
  }
  const priorRounds = (redline.history || []).filter((h) => h.round < redline.round_number)

  // Clause types that only restate the title are noise on a row this tight.
  const titleKey = (redline.clause_title || '').trim().toLowerCase()
  const positions = (redline.covers?.length ? redline.covers : [redline.clause_type])
    .filter(Boolean)
    .filter((t) => humaniseClauseType(t).toLowerCase() !== titleKey)

  useEffect(() => {
    setDraftText(redline.proposed_text || '')
    setDraftRationale(redline.rationale || '')
  }, [redline.proposed_text, redline.rationale])

  useEffect(() => {
    if (!isActive) setEditing(false)
  }, [isActive])

  // Keep the open row in view when selection is driven from the document.
  useEffect(() => {
    if (!isActive || !rowRef.current) return
    const rect = rowRef.current.getBoundingClientRect()
    const parent = rowRef.current.parentElement?.getBoundingClientRect()
    if (!parent) return
    if (rect.top < parent.top || rect.top > parent.bottom - 80) {
      scrollIntoView(rowRef.current, 'nearest')
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

  // Rewording a clause IS accepting it — nobody edits language they intend to
  // drop. Leaving the edit at "modified" meant a second, easily-missed click
  // before it counted, and a redline that looked decided but was not.
  const commitEdit = async () => {
    await save({ proposed_text: draftText, rationale: draftRationale, status: 'accepted' })
    setEditing(false)
  }

  return (
    <div
      ref={rowRef}
      className={cn(
        'relative border-b transition-colors',
        // Rows read as paper by default and tint when opened, not the other way
        // round. A list where only the open item is white makes the twenty you
        // have not opened look disabled, when they are the work still to do.
        isActive ? 'bg-accent' : 'bg-card hover:bg-secondary',
        settled && !isActive && 'opacity-55',
      )}
    >
      {/* Severity as an edge, so the column can be scanned for red without
          reading a word of it. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: meta.dot }}
      />

      {/* ── the row ─────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => onSelect?.(isActive ? null : redline.id)}
        aria-expanded={isActive}
        className="flex w-full items-start gap-2 py-2.5 pl-4 pr-3 text-left"
      >
        <ChevronDown
          className={cn(
            'mt-[3px] h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            !isActive && '-rotate-90',
          )}
        />

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            {redline.clause_ref && (
              <span className="shrink-0 font-mono-num text-[11px] text-muted-foreground">
                {redline.clause_ref}
              </span>
            )}
            <span className="truncate text-[13px] font-medium text-foreground">
              {redline.clause_title || humaniseClauseType(redline.clause_type)}
            </span>
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
            {/* The full name, not the shorthand: "Rejected" and "New change"
                read as jargon next to a clause title, where "Vendor rejected"
                and "Vendor new change" say who did what. Sentence case for the
                same reason — these are statements, not labels. */}
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={
                action
                  ? { background: action.bg, color: action.fg }
                  : { background: meta.bg, color: meta.fg }
              }
              title={action ? action.hint : meta.hint}
            >
              {action ? action.label : meta.short}
            </span>
            {!isAnchored && <span className="italic">not in this contract</span>}
            {redline.doc_section && redline.doc_section !== 'Main Agreement' && (
              <span className="truncate">· {redline.doc_section}</span>
            )}
            {positions.length > 0 && (
              <span className="truncate" title={positions.map(humaniseClauseType).join(' · ')}>
                · {positions.slice(0, 2).map(humaniseClauseType).join(' · ')}
                {positions.length > 2 && ` +${positions.length - 2}`}
              </span>
            )}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          {redline.is_manual_override && (
            <span className="whitespace-nowrap text-[10px] font-medium text-muted-foreground">
              Edited
            </span>
          )}
          {settled ? (
            <span className="whitespace-nowrap text-[10.5px] font-medium text-muted-foreground">
              {ISSUE_STATUS[redline.issue_status]?.label}
            </span>
          ) : decided ? (
            <span
              className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={
                redline.status === 'accepted'
                  ? { background: 'var(--acceptable-bg)', color: 'var(--acceptable-fg)' }
                  : redline.status === 'rejected'
                  ? { background: 'var(--muted)', color: 'var(--muted-foreground)' }
                  : { background: 'var(--brand-primary-light)', color: 'var(--primary)' }
              }
            >
              {REDLINE_STATUS[redline.status]?.label ?? redline.status}
            </span>
          ) : (
            !isMissing &&
            (redline.words_added > 0 || redline.words_removed > 0) && (
              <span className="whitespace-nowrap font-mono-num text-[10.5px]">
                <span style={{ color: 'var(--ins-fg)' }}>+{redline.words_added}</span>{' '}
                <span style={{ color: 'var(--del-fg)' }}>−{redline.words_removed}</span>
              </span>
            )
          )}
        </span>
      </button>

      {/* ── the open one ────────────────────────────────────────────────── */}
      {isActive && (
        <div className="tab-panel-enter space-y-3 border-t py-3 pl-5 pr-4">
          {/* Their own words. Usually the most informative thing in a returned
              contract, and the surest guide to where this actually lands. */}
          {redline.vendor_comment && (
            <div
              className="flex gap-2 rounded-md border-l-2 bg-card px-2.5 py-2"
              style={{ borderColor: 'var(--primary)' }}
            >
              <MessageSquareQuote className="mt-[2px] h-3.5 w-3.5 shrink-0 text-primary" />
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                {redline.vendor_comment}
              </p>
            </div>
          )}

          {editing ? (
            <div>
              <FieldLabel>Rationale — becomes the margin comment in Word</FieldLabel>
              <textarea
                className="input h-auto min-h-[72px] w-full resize-y py-2 text-[12.5px] leading-relaxed"
                value={draftRationale}
                onChange={(e) => setDraftRationale(e.target.value)}
              />
            </div>
          ) : (
            redline.rationale && (
              <p className="text-[12.5px] leading-[1.6] text-muted-foreground">
                {redline.rationale}
              </p>
            )
          )}

          {/* Their wording, then ours. The comparison the decision turns on, so
              it is the one thing here that is never behind another click. */}
          {!isMissing && redline.original_text && (
            <div>
              <FieldLabel>
                {action ? 'As it now reads in their version' : 'As written by the counterparty'}
              </FieldLabel>
              <p
                className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-md border bg-card p-2.5 text-[12px] leading-relaxed"
                style={{ color: 'var(--del-fg)' }}
              >
                {redline.original_text}
              </p>
            </div>
          )}

          {(redline.proposed_text || editing) && (
            <div>
              {!isMissing && redline.original_text && (
                <div className="flex justify-center pb-1.5">
                  <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/60" />
                </div>
              )}
              <FieldLabel>{isMissing ? 'Language to insert' : 'Our proposed wording'}</FieldLabel>
              {editing ? (
                <textarea
                  className="input h-auto min-h-[160px] w-full resize-y py-2 text-[12px] leading-relaxed"
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="Replacement clause text"
                />
              ) : (
                <p
                  className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-md p-2.5 text-[12px] leading-relaxed"
                  style={{ background: 'var(--ins-bg)', color: 'var(--ins-fg)' }}
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

          {/* The thread. Without it a reviewer in round three trades away the
              same point twice, having no way to see they already conceded it. */}
          {priorRounds.length > 0 && (
            <details className="group/hist">
              <summary className="cursor-pointer list-none text-[11.5px] font-medium text-muted-foreground hover:text-foreground">
                <ChevronDown className="mr-1 inline h-3 w-3 -rotate-90 transition-transform group-open/hist:rotate-0" />
                Negotiation history · {priorRounds.length + 1} rounds
              </summary>
              <ol className="mt-2 space-y-2 rounded-md border bg-card p-2.5">
                {priorRounds.map((entry) => (
                  <li key={entry.redline_id} className="flex gap-2">
                    <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted font-mono-num text-[9.5px] font-semibold text-muted-foreground">
                      {entry.round}
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      {/* A round where we proposed nothing and they did nothing
                          still has to say so. Rendering only the two optional
                          lines left an empty numbered row, which reads as data
                          that failed to load rather than as a quiet round. */}
                      {!entry.our_proposal && !entry.vendor_action && (
                        <p className="text-[11.5px] leading-snug text-muted-foreground">
                          Assessed as {metaFor(entry.classification).short.toLowerCase()} — no
                          edit proposed.
                        </p>
                      )}
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
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          )}

          {/* Decision */}
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
            {readOnly ? (
              <span className="text-[11.5px] italic text-muted-foreground">
                A past round — open the latest to make changes.
              </span>
            ) : editing ? (
              <>
                <Decision
                  icon={Check}
                  label="Save and accept"
                  hint="Records the reworded clause as your decision"
                  active
                  activeTone="primary"
                  onClick={commitEdit}
                  disabled={saving}
                />
                <Decision
                  icon={X}
                  label="Cancel"
                  onClick={() => {
                    setDraftText(redline.proposed_text || '')
                    setDraftRationale(redline.rationale || '')
                    setEditing(false)
                  }}
                  disabled={saving}
                />
              </>
            ) : action ? (
              <>
                {redline.vendor_action === 'countered' && (
                  <Decision
                    icon={Handshake}
                    label="Accept theirs"
                    hint="Take the counterparty's wording and close this point"
                    active={chose.acceptTheirs}
                    activeTone="primary"
                    onClick={() => save({ status: 'rejected', issue_status: 'agreed' })}
                    disabled={locked}
                  />
                )}
                <Decision
                  icon={Check}
                  label="Push back"
                  hint="Keep this edit in the redline going back to them"
                  active={chose.accept}
                  activeTone="primary"
                  onClick={() => save({ status: 'accepted' })}
                  disabled={locked || !redline.proposed_text}
                />
                <Decision
                  icon={Pencil}
                  label="Edit"
                  hint="Reword what we are asking for"
                  onClick={() => setEditing(true)}
                  disabled={locked}
                />
                <Decision
                  icon={X}
                  label="Concede"
                  hint="Give this point up and stop raising it"
                  active={chose.concede}
                  activeTone="danger"
                  onClick={() => save({ status: 'rejected', issue_status: 'conceded' })}
                  disabled={locked}
                />
                {settled && (
                  <Decision
                    icon={Undo2}
                    label="Reopen"
                    hint="Put this point back on the table"
                    onClick={() => save({ status: 'suggested', issue_status: 'open' })}
                    disabled={locked}
                  />
                )}
              </>
            ) : (
              <>
                <Decision
                  icon={Check}
                  label="Accept"
                  hint="Keep this change in the exported redline"
                  active={chose.accept}
                  activeTone="primary"
                  onClick={() => save({ status: 'accepted' })}
                  disabled={locked || !redline.proposed_text}
                />
                <Decision
                  icon={X}
                  label="Reject"
                  hint="Leave the clause exactly as the counterparty wrote it"
                  active={chose.reject}
                  activeTone="danger"
                  onClick={() => save({ status: 'rejected' })}
                  disabled={locked}
                />
                <Decision
                  icon={Pencil}
                  label="Edit"
                  hint="Reword the proposed change"
                  onClick={() => setEditing(true)}
                  disabled={locked}
                />
              </>
            )}

            <div className="flex-1" />

            {redline.source === 'user' && (
              <span
                className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground"
                title="Added by a reviewer, not by the analysis"
              >
                Manual
              </span>
            )}
            {redline.source === 'user' && onDelete && !readOnly && !editing && (
              <button
                type="button"
                title="Delete this manually added redline"
                aria-label="Delete this manually added redline"
                onClick={() => onDelete(redline.id)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
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

/**
 * A decision. Neutral until it is the one on record, then coloured by what it
 * means: blue for keeping an edit, red for giving one up.
 *
 * Coloured with inline styles from the theme tokens rather than `bg-primary` /
 * `bg-destructive` utilities — the same way every other semantic colour in this
 * app is applied. It keeps the palette in one place (the CSS variables) instead
 * of split between variables and Tailwind's colour config.
 */
const DECISION_TONES = {
  primary: { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' },
  danger: { background: 'var(--destructive)', borderColor: 'var(--destructive)', color: '#fff' },
}

function Decision({ icon: Icon, label, hint, onClick, disabled, active, activeTone }) {
  const tone = active ? DECISION_TONES[activeTone] : null
  return (
    <button
      type="button"
      title={hint || label}
      aria-pressed={active ? 'true' : undefined}
      onClick={onClick}
      disabled={disabled}
      style={tone ?? undefined}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
        tone
          ? 'hover:opacity-90'
          : 'border-input bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}
