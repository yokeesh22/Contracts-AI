import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { metaFor, humaniseClauseType, REDLINE_STATUS } from '../lib/classifications'
import { cn, scrollIntoView } from '../lib/utils'

/**
 * One finding: what the clause says, what we want it to say, and why.
 *
 * A card rather than a table row because every finding carries five things a
 * reviewer has to read in full — original text, proposed text, rationale,
 * assessment and status. Truncating any of those into a cell defeats the point
 * of the review.
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
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState(redline.proposed_text || '')
  const [draftRationale, setDraftRationale] = useState(redline.rationale || '')
  const [saving, setSaving] = useState(false)
  const cardRef = useRef(null)

  const meta = metaFor(redline.classification)
  const isRejected = redline.status === 'rejected'
  const isMissing = redline.classification === 'MISSING'

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

  const location = redline.block_start == null
    ? 'Not in this contract'
    : [redline.doc_section, redline.clause_ref].filter(Boolean).join(' · ') ||
      `Block ${redline.block_start}`

  return (
    <div
      ref={cardRef}
      onClick={() => onSelect?.(redline.id)}
      className={cn(
        'hover-lift cursor-pointer overflow-hidden rounded-xl border bg-card shadow-card',
        isActive && 'ring-2 ring-primary',
        isRejected && 'opacity-60',
      )}
      style={isActive ? undefined : { borderColor: meta.border }}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5 px-4 pb-2.5 pt-3.5">
        <span
          className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
          style={{ background: meta.dot }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold leading-snug text-foreground">
            {redline.clause_title || humaniseClauseType(redline.clause_type)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
            <span className="font-mono-num">{location}</span>
            {redline.page != null && (
              <>
                <span aria-hidden>·</span>
                <span className="font-mono-num">p.{redline.page}</span>
              </>
            )}
          </div>

          {/* Every position this one edit resolves. A clause routinely fails
              more than one, and they are fixed together because two edits to
              the same paragraph cannot both survive into the export. */}
          {(redline.covers?.length ? redline.covers : [redline.clause_type])
            .filter(Boolean)
            .length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(redline.covers?.length ? redline.covers : [redline.clause_type])
                .filter(Boolean)
                .map((type) => (
                  <span
                    key={type}
                    className="rounded border bg-secondary px-1.5 py-0.5 text-[10.5px] text-muted-foreground"
                  >
                    {humaniseClauseType(type)}
                  </span>
                ))}
            </div>
          )}
        </div>
        <span
          className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium"
          style={{ background: meta.bg, color: meta.fg, borderColor: meta.border }}
          title={meta.hint}
        >
          {meta.short}
        </span>
      </div>

      {/* Rationale — the part that persuades, so it is never truncated away */}
      {(redline.rationale || editing) && (
        <div className="px-4 pb-3" onClick={(e) => e.stopPropagation()}>
          {editing ? (
            <>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Rationale (becomes the margin comment in Word)
              </label>
              <textarea
                className="input h-auto min-h-[70px] w-full resize-y py-2 leading-relaxed"
                value={draftRationale}
                onChange={(e) => setDraftRationale(e.target.value)}
              />
            </>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              {redline.rationale}
            </p>
          )}
        </div>
      )}

      {/* The edit itself */}
      <div className="border-t" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {isMissing ? 'Clause to add' : 'Proposed change'}
          {!isMissing && (redline.words_added > 0 || redline.words_removed > 0) && (
            <span className="ml-1 font-mono-num text-[11px]">
              <span style={{ color: 'var(--ins-fg)' }}>+{redline.words_added}</span>{' '}
              <span style={{ color: 'var(--del-fg)' }}>-{redline.words_removed}</span>
            </span>
          )}
        </button>

        {expanded && (
          <div className="tab-panel-enter space-y-3 px-4 pb-3.5">
            {!isMissing && redline.original_text && (
              <Section title="As written by the counterparty">
                <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">
                  {redline.original_text}
                </p>
              </Section>
            )}

            <Section title={isMissing ? 'Language to insert' : 'Our proposed wording'}>
              {editing ? (
                <textarea
                  className="input h-auto min-h-[150px] w-full resize-y py-2 font-mono-num text-[12px] leading-relaxed"
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="Replacement clause text"
                />
              ) : (
                <p
                  className="whitespace-pre-wrap rounded-md p-2.5 text-[12px] leading-relaxed"
                  style={{ background: 'var(--ins-bg)', color: 'var(--ins-fg)' }}
                >
                  {redline.proposed_text || 'No replacement text.'}
                </p>
              )}
            </Section>

            {editing && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-primary h-8 px-3 text-[13px]"
                  onClick={commitEdit}
                  disabled={saving}
                >
                  <Check className="h-3.5 w-3.5" />
                  Save
                </button>
                <button
                  type="button"
                  className="btn-secondary h-8 px-3 text-[13px]"
                  onClick={cancelEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Review controls */}
      <div
        className="flex items-center gap-1.5 border-t bg-secondary px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <StatusPill redline={redline} />
        <div className="flex-1" />

        {!editing && (
          <>
            {isRejected ? (
              <IconButton
                label="Restore this suggestion"
                onClick={() => save({ status: 'suggested' })}
                disabled={disabled || saving}
              >
                <Undo2 className="h-3.5 w-3.5" />
                Restore
              </IconButton>
            ) : (
              <>
                <IconButton
                  label="Keep this change in the exported redline"
                  onClick={() => save({ status: 'accepted' })}
                  disabled={disabled || saving}
                  tone={redline.status === 'accepted' ? 'active' : 'default'}
                >
                  <Check className="h-3.5 w-3.5" />
                  Accept
                </IconButton>
                <IconButton
                  label="Leave the clause exactly as the counterparty wrote it"
                  onClick={() => save({ status: 'rejected' })}
                  disabled={disabled || saving}
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </IconButton>
              </>
            )}
            <IconButton
              label="Reword the proposed change"
              onClick={() => {
                setExpanded(true)
                setEditing(true)
              }}
              disabled={disabled || saving}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </IconButton>
          </>
        )}

        {redline.source === 'user' && onDelete && !editing && (
          <IconButton
            label="Delete this manually added redline"
            onClick={() => onDelete(redline.id)}
            disabled={disabled || saving}
            tone="danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  )
}

function StatusPill({ redline }) {
  const status = REDLINE_STATUS[redline.status] || { label: redline.status, hint: '' }
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground"
      title={status.hint}
    >
      {status.label}
      {redline.source === 'user' && (
        <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
          Added by reviewer
        </span>
      )}
      {redline.is_manual_override && redline.source !== 'user' && (
        <RotateCcw className="h-3 w-3" aria-label="Edited by a reviewer" />
      )}
    </span>
  )
}

function IconButton({ children, label, onClick, disabled, tone = 'default' }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        tone === 'active' && 'border-primary bg-accent text-accent-foreground',
        tone === 'danger' &&
          'border-transparent text-destructive hover:border-destructive/30 hover:bg-red-50',
        tone === 'default' && 'bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
