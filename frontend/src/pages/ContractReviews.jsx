import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  FileSignature,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import PageLayout from '../components/PageLayout'
import DataTable from '../components/DataTable'
import Dialog from '../components/Dialog'
import FileUpload from '../components/FileUpload'
import StatusBadge from '../components/StatusBadge'
import {
  createReview,
  deleteReview,
  getPlaybooks,
  getReviews,
} from '../services/api'
import { waitingLabel } from '../lib/classifications'
import { cn } from '../lib/utils'

// A negotiation is "moving" while its current round is still being processed;
// that is the only time the list needs to refresh itself.
const RUNNING = ['ai_in_progress']

export default function ContractReviews() {
  const navigate = useNavigate()
  const [reviews, setReviews] = useState([])
  const [playbooks, setPlaybooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  // Which negotiations are showing their rounds. Collapsed by default: the row
  // is about where the deal stands, and the history is only wanted on demand.
  const [expanded, setExpanded] = useState(() => new Set())

  const load = async () => {
    const [r, p] = await Promise.all([getReviews(), getPlaybooks()])
    setReviews(r)
    setPlaybooks(p)
    setLoading(false)
    return r
  }

  useEffect(() => {
    load()
  }, [])

  // Keep the list fresh while any review is still being processed.
  const anyRunning = useMemo(
    () => reviews.some((r) => RUNNING.includes(r.status)),
    [reviews],
  )
  useEffect(() => {
    if (!anyRunning) return undefined
    const timer = setInterval(load, 3000)
    return () => clearInterval(timer)
  }, [anyRunning])

  const toggleRounds = (e, id) => {
    e.stopPropagation()
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (
      !window.confirm(
        'Delete this negotiation, every round of it, and all of its findings?',
      )
    )
      return
    await deleteReview(id)
    setReviews((prev) => prev.filter((r) => r.id !== id))
  }

  const columns = [
    {
      key: 'name',
      header: 'Contract',
      // The contract's own name only. The second line used to carry the latest
      // round's filename, which changes every time the counterparty sends
      // something back — so a row people identify by name kept renaming itself.
      render: (row) => (
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-foreground" title={row.file_name}>
            {row.name}
          </div>
        </div>
      ),
    },
    {
      key: 'counterparty',
      header: 'Counterparty',
      className: 'w-44',
      render: (row) => (
        <span className="text-[13px] text-muted-foreground">{row.counterparty || '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-40',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      // Doubles as the expander. The current round is what matters at a glance;
      // the rest of the exchange is one click away rather than another page.
      key: 'round',
      header: 'Round',
      className: 'w-24',
      render: (row) => {
        const rounds = row.rounds?.length ?? row.total_rounds ?? 1
        const isOpen = expanded.has(row.id)
        return (
          <button
            type="button"
            onClick={(e) => toggleRounds(e, row.id)}
            disabled={rounds < 2}
            title={
              rounds > 1
                ? `${rounds} versions exchanged — click to see them`
                : 'The counterparty’s opening paper'
            }
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-mono-num text-[13px] text-foreground transition-colors',
              rounds > 1 && 'hover:bg-muted',
              rounds < 2 && 'cursor-default',
            )}
          >
            R{row.current_round}
            {rounds > 1 && (
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 text-muted-foreground transition-transform',
                  !isOpen && '-rotate-90',
                )}
              />
            )}
          </button>
        )
      },
    },
    {
      // The number that says whether the deal is nearly done. Findings counted
      // per round would climb and fall as rounds turn over; open issues only
      // fall, which is what a negotiation actually looks like.
      key: 'open_issues',
      header: 'Open issues',
      className: 'w-28',
      render: (row) =>
        RUNNING.includes(row.status) ? (
          <span className="font-mono-num text-[13px] text-muted-foreground">
            {row.analyzed_count}/{row.total_clauses || '?'}
          </span>
        ) : (
          <span className="font-mono-num text-[13px] text-foreground">
            {row.open_issues}
            <span className="text-muted-foreground">/{row.total_issues}</span>
          </span>
        ),
    },
    {
      // Ageing, not a date. "12 days" is the thing that makes somebody pick up
      // the phone; "24 Aug" is a fact nobody acts on.
      key: 'waiting',
      header: 'Waiting',
      className: 'w-28',
      render: (row) => {
        const waiting =
          row.status === 'pending_vendor' ? waitingLabel(row.sent_to_vendor_at) : null
        if (!waiting) {
          return (
            <span className="font-mono-num text-xs text-muted-foreground">
              {row.last_activity_at
                ? new Date(row.last_activity_at).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                  })
                : '—'}
            </span>
          )
        }
        const days = Number.parseInt(waiting, 10) || 0
        return (
          <span
            className="inline-flex items-center gap-1 font-mono-num text-xs font-medium"
            style={{ color: days >= 10 ? '#b91c1c' : days >= 5 ? '#c2410c' : 'var(--muted-foreground)' }}
            title={`Sent ${new Date(row.sent_to_vendor_at).toLocaleDateString()}`}
          >
            <Clock className="h-3 w-3" />
            {waiting}
          </span>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      render: (row) => (
        <button
          type="button"
          onClick={(e) => handleDelete(e, row.id)}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-destructive"
          aria-label="Delete review"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ]

  return (
    <PageLayout
      title="Contract Reviews"
      subtitle="Every negotiation, and where each one stands"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Contract Reviews' }]}
      actions={
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New review
        </button>
      }
    >
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={reviews}
          onRowClick={(row) => navigate(`/reviews/${row.id}`)}
          renderExpanded={(row) =>
            expanded.has(row.id) && row.rounds?.length > 1 ? (
              <tr key={`${row.id}-rounds`} className="border-b bg-secondary">
                <td colSpan={columns.length} className="px-4 py-2">
                  <RoundList
                    rounds={row.rounds}
                    currentRound={row.current_round}
                    onOpen={(versionId) =>
                      navigate(`/reviews/${row.id}?version=${versionId}`)
                    }
                  />
                </td>
              </tr>
            ) : null
          }
          emptyMessage="No contracts reviewed yet. Upload one to get started."
        />
      )}

      <NewReviewDialog
        open={open}
        onClose={() => setOpen(false)}
        playbooks={playbooks}
        onCreated={(created) => {
          setOpen(false)
          navigate(`/reviews/${created.id}`)
        }}
      />
    </PageLayout>
  )
}

/**
 * The rounds of one negotiation, newest first, each opening straight into that
 * version of the contract.
 *
 * Newest first because that is the one anybody wants; the older ones read as
 * what they are, a record of what was on the table at the time.
 */
function RoundList({ rounds, currentRound, onOpen }) {
  return (
    <ol className="space-y-1">
      {[...rounds].reverse().map((round) => {
        const isCurrent = round.round_number === currentRound
        return (
          <li key={round.id}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpen(round.id)
              }}
              className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-card"
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono-num text-[10.5px] font-semibold',
                  isCurrent ? 'bg-primary text-white' : 'bg-muted text-muted-foreground',
                )}
              >
                {round.round_number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-foreground">
                  {round.round_number === 1 ? 'Opening paper' : 'Vendor response'}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {round.file_name}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {new Date(round.created_at).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                  <span className="font-mono-num">· {round.total_clauses} findings</span>
                  {round.has_tracked_changes && (
                    <span title="Came back with the counterparty's tracked changes">
                      · their markup
                    </span>
                  )}
                  {round.sent_at && (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      sent{' '}
                      {new Date(round.sent_at).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                  )}
                </span>
              </span>
              {round.status !== 'completed' && <StatusBadge status={round.status} />}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function NewReviewDialog({ open, onClose, playbooks, onCreated }) {
  const [name, setName] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [playbookId, setPlaybookId] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!open) return
    setName('')
    setCounterparty('')
    setFile(null)
    setProgress(0)
    const preferred = playbooks.find((p) => p.is_default) || playbooks[0]
    setPlaybookId(preferred ? String(preferred.id) : '')
  }, [open, playbooks])

  // Default the review name from the filename — it is almost always right,
  // and saves retyping the contract's name on every upload.
  const handleFile = (selected) => {
    setFile(selected)
    if (selected && !name.trim()) {
      setName(selected.name.replace(/\.(docx|pdf)$/i, ''))
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!file || !playbookId) return
    setBusy(true)
    try {
      const created = await createReview(
        { playbookId, name: name.trim() || file.name, counterparty: counterparty.trim(), file },
        setProgress,
      )
      onCreated(created)
    } catch (err) {
      window.alert(err?.response?.data?.detail || 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New contract review"
      icon={FileSignature}
      description="Word files get a full tracked-changes export; PDFs are redlined on screen but cannot keep their original formatting."
      maxWidth={580}
    >
      <form onSubmit={submit} className="space-y-3.5">
        <div>
          <label className="label">Contract document</label>
          <FileUpload
            accept=".pdf,.docx"
            selectedFile={file}
            onFileSelect={handleFile}
            label="Drop the contract here or click to browse"
            hint="Supported: DOCX, PDF"
          />
        </div>

        <div>
          <label className="label">Review name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Box Service Agreement 2026"
          />
        </div>

        <div>
          <label className="label">Counterparty</label>
          <input
            className="input"
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            placeholder="e.g. Box, Inc."
          />
        </div>

        <div>
          <label className="label">Playbook</label>
          <select
            className="input"
            value={playbookId}
            onChange={(e) => setPlaybookId(e.target.value)}
            required
          >
            {!playbooks.length && <option value="">No playbooks available</option>}
            {playbooks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.rule_count} rules)
              </option>
            ))}
          </select>
        </div>

        {busy && progress > 0 && progress < 100 && (
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy || !file || !playbookId}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Start review
          </button>
        </div>
      </form>
    </Dialog>
  )
}
