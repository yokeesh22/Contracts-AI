import { ArrowLeftRight, CheckCircle2, Loader2, MessageSquare, Plus } from 'lucide-react'
import { cn } from '../lib/utils'

const RUNNING = ['queued', 'pending', 'extracting', 'analyzing']

const shortDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    : null

/**
 * The negotiation as a timeline: one chip per document version, oldest first.
 *
 * This is the piece that makes a multi-round deal legible. Everything else on
 * the page — the document pane, the findings, the exports — belongs to exactly
 * one round, and without a visible spine a reviewer has no way to tell which
 * round they are reading, nor that earlier ones exist at all.
 *
 * Selecting a round is a read: it shows what the contract said and what we asked
 * for at that point. Only the latest round is editable, because writing into a
 * superseded version would produce a redline against a document the counterparty
 * has already replaced.
 */
export default function RoundStrip({
  versions = [],
  selectedId,
  onSelect,
  onAddRound,
  canAddRound = false,
}) {
  if (!versions.length) return null

  const latestId = versions[versions.length - 1]?.id

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {versions.map((version, i) => {
        const active = version.id === selectedId
        const running = RUNNING.includes(version.status)
        const failed = version.status === 'failed'
        const isLatest = version.id === latestId

        return (
          <div key={version.id} className="flex shrink-0 items-center gap-1.5">
            {i > 0 && (
              <ArrowLeftRight
                aria-hidden
                className="h-3 w-3 shrink-0 text-muted-foreground/40"
              />
            )}
            <button
              type="button"
              onClick={() => onSelect?.(version.id)}
              title={roundHint(version)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-all',
                active
                  ? 'border-primary bg-accent ring-1 ring-primary'
                  : 'bg-card hover:border-primary/40 hover:bg-secondary',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold',
                  active
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {running ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  `R${version.round_number}`.slice(1)
                )}
              </span>

              <span className="flex flex-col leading-tight">
                <span className="text-[12px] font-medium text-foreground">
                  {version.round_number === 1 ? 'Opening paper' : 'Vendor response'}
                </span>
                <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                  {failed ? (
                    <span className="text-destructive">failed</span>
                  ) : running ? (
                    'analysing…'
                  ) : (
                    <>
                      {shortDate(version.created_at)}
                      {version.sent_at && (
                        <>
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          sent {shortDate(version.sent_at)}
                        </>
                      )}
                    </>
                  )}
                </span>
              </span>

              {/* Their revision marks are the evidence the reconciliation is
                  built on, so it is worth saying out loud when a returned file
                  arrived without any. */}
              {version.has_tracked_changes && (
                <MessageSquare
                  className="h-3 w-3 shrink-0 text-primary"
                  aria-label="Contains the counterparty's tracked changes"
                />
              )}
              {!isLatest && (
                <span className="rounded bg-muted px-1 py-0.5 text-[9.5px] uppercase tracking-wide text-muted-foreground">
                  past
                </span>
              )}
            </button>
          </div>
        )
      })}

      {canAddRound && (
        <>
          <ArrowLeftRight aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground/40" />
          <button
            type="button"
            onClick={onAddRound}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            title="Upload the version the counterparty sent back"
          >
            <Plus className="h-3.5 w-3.5" />
            Vendor response
          </button>
        </>
      )}
    </div>
  )
}

function roundHint(version) {
  const bits = [
    version.round_number === 1
      ? 'The contract as first received'
      : `Round ${version.round_number} — returned by the counterparty`,
    version.file_name,
  ]
  if (version.revision_authors?.length) {
    bits.push(`Tracked changes by ${version.revision_authors.join(', ')}`)
  } else if (version.round_number > 1) {
    bits.push('No tracked changes found — comparison is by text only')
  }
  if (version.sent_at) {
    bits.push(`Our redline sent ${new Date(version.sent_at).toLocaleDateString()}`)
  }
  return bits.filter(Boolean).join('\n')
}
