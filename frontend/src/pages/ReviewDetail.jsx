import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileText,
  Info,
  ListChecks,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import ContractViewer from '../components/ContractViewer'
import RedlineList from '../components/RedlineList'
import Dialog from '../components/Dialog'
import StatusBadge from '../components/StatusBadge'
import {
  createRedline,
  deleteRedline,
  exportIssues,
  exportRedline,
  getReview,
  updateRedline,
} from '../services/api'
import { cn } from '../lib/utils'

const VIEW_MODES = [
  { key: 'original', label: 'Original', hint: 'The contract exactly as received.' },
  { key: 'redlined', label: 'Redlined', hint: 'Our proposed changes, marked up.' },
  { key: 'final', label: 'Final', hint: 'Every kept change applied, read clean.' },
]

const RUNNING = ['pending', 'extracting', 'analyzing']

export default function ReviewDetail() {
  const { id } = useParams()
  const [review, setReview] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('redlined')
  const [section, setSection] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [exporting, setExporting] = useState(null)
  const [selection, setSelection] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const pollRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const data = await getReview(id)
      setReview(data)
      setSection((prev) => prev ?? data.sections?.[0] ?? null)
      return data
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load this review.')
      return null
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // Poll while the analysis is in flight so findings stream in as they land.
  const isRunning = review && RUNNING.includes(review.status)
  useEffect(() => {
    if (!isRunning) {
      if (pollRef.current) clearInterval(pollRef.current)
      return undefined
    }
    pollRef.current = setInterval(load, 2500)
    return () => clearInterval(pollRef.current)
  }, [isRunning, load])

  // Selecting a finding that lives in another exhibit has to move the document
  // pane there first, or the clause simply is not rendered and the click looks
  // broken. One upload routinely carries several agreements — Vimeo's ships an
  // SLA, a DPA and an AI addendum alongside the main terms.
  const selectRedline = useCallback(
    (redlineId) => {
      setActiveId(redlineId)
      const redline = review?.redlines?.find((r) => r.id === redlineId)
      if (redline?.doc_section && redline.doc_section !== section) {
        setSection(redline.doc_section)
      }
    },
    [review, section],
  )

  const handleUpdate = async (redlineId, patch) => {
    const updated = await updateRedline(id, redlineId, patch)
    setReview((prev) => ({
      ...prev,
      redlines: prev.redlines.map((r) => (r.id === redlineId ? updated : r)),
    }))
  }

  const handleDelete = async (redlineId) => {
    await deleteRedline(id, redlineId)
    setReview((prev) => ({
      ...prev,
      redlines: prev.redlines.filter((r) => r.id !== redlineId),
    }))
    if (activeId === redlineId) setActiveId(null)
  }

  const handleAdd = async (payload) => {
    const created = await createRedline(id, payload)
    setReview((prev) => ({ ...prev, redlines: [...prev.redlines, created] }))
    setSelection(null)
    setAddOpen(false)
    setActiveId(created.id)
  }

  const handleExport = async (kind) => {
    setExporting(kind)
    try {
      if (kind === 'redline') {
        const faithful = await exportRedline(id)
        if (!faithful) {
          window.alert(
            'This contract was uploaded as a PDF, so the redline was rebuilt from ' +
              'extracted text. The tracked changes are complete, but the original ' +
              'formatting is not preserved.',
          )
        }
      } else {
        await exportIssues(id)
      }
    } catch (e) {
      window.alert(e?.response?.data?.detail || 'Export failed.')
    } finally {
      setExporting(null)
    }
  }

  const progress = useMemo(() => {
    if (!review?.total_clauses) return 0
    return Math.round((review.analyzed_count / review.total_clauses) * 100)
  }, [review])

  if (error) {
    return (
      <CenterMessage>
        <p className="text-[13px] text-destructive">{error}</p>
        <Link to="/reviews" className="mt-3 inline-block text-[13px] text-primary hover:underline">
          Back to reviews
        </Link>
      </CenterMessage>
    )
  }

  if (!review) {
    return (
      <CenterMessage>
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      </CenterMessage>
    )
  }

  const done = review.status === 'completed'

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b bg-card px-5 py-2.5">
        <Link
          to="/reviews"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Back to reviews"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold leading-tight text-foreground">
            {review.name}
          </h1>
          <p className="truncate text-[12px] text-muted-foreground">
            {review.counterparty ? `${review.counterparty} · ` : ''}
            {review.file_name} · reviewed against {review.playbook?.name}
          </p>
        </div>
        <StatusBadge status={review.status} />
        <div className="flex-1" />
        <button
          type="button"
          className="btn-secondary h-8 px-3 text-[13px]"
          onClick={() => handleExport('issues')}
          disabled={!done || exporting}
          title="Download the issues list for circulation"
        >
          {exporting === 'issues' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ListChecks className="h-3.5 w-3.5" />
          )}
          Issues list
        </button>
        <button
          type="button"
          className="btn-primary h-8 px-3 text-[13px]"
          onClick={() => handleExport('redline')}
          disabled={!done || exporting}
          title="Download the marked-up contract with Word tracked changes"
        >
          {exporting === 'redline' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Redlined .docx
        </button>
      </div>

      {/* Split body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — the document */}
        <div className="flex w-1/2 flex-col border-r" style={{ background: '#eef1f6' }}>
          <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-secondary px-3">
            <SegmentedControl value={mode} onChange={setMode} options={VIEW_MODES} />
            <div className="flex-1" />
            {review.sections?.length > 1 && (
              <select
                className="h-7 max-w-[240px] rounded-md border bg-card px-2 text-[12px] text-foreground outline-none"
                value={section || ''}
                onChange={(e) => setSection(e.target.value)}
                title="This upload contains several documents"
              >
                {review.sections.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </div>

          {review.doc_kind === 'pdf' && (
            <div
              className="flex shrink-0 items-start gap-2 border-b px-3 py-2 text-[12px]"
              style={{ background: '#fffbeb', color: '#92400e', borderColor: '#fde68a' }}
            >
              <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" />
              <span>
                Uploaded as PDF. Redlining works here, but the exported Word file is
                rebuilt from extracted text and will not keep the original formatting.
              </span>
            </div>
          )}

          <div className="min-h-0 flex-1">
            <ContractViewer
              blocks={review.blocks}
              redlines={review.redlines}
              mode={mode}
              section={section}
              activeRedlineId={activeId}
              onSelectRedline={selectRedline}
              selectionEnabled={done}
              onSelectBlocks={setSelection}
            />
          </div>
        </div>

        {/* Right — the findings */}
        <div className="flex w-1/2 flex-col overflow-hidden bg-background">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-card px-4">
            <FileText className="h-[15px] w-[15px] text-primary" />
            <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Findings
            </span>
            <span className="font-mono-num text-xs text-muted-foreground">
              {review.redlines?.length ?? 0}
            </span>
          </div>

          {isRunning && (
            <div className="shrink-0 border-b bg-card px-4 py-2.5">
              <div
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]"
                style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}
              >
                <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
                Reviewing the contract — findings appear as each clause is assessed.
              </div>
              {review.total_clauses > 0 && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {review.error_message && (
            <div className="shrink-0 border-b bg-card px-4 py-2.5">
              <div
                className="flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]"
                style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
              >
                <AlertTriangle className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                {review.error_message}
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1">
            <RedlineList
              redlines={review.redlines || []}
              activeRedlineId={activeId}
              onSelect={selectRedline}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onAdd={() => setAddOpen(true)}
              pendingSelection={selection}
              disabled={!done}
            />
          </div>
        </div>
      </div>

      <AddRedlineDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        selection={selection}
        sections={review.sections || []}
        currentSection={section}
        onSubmit={handleAdd}
      />
    </div>
  )
}

function SegmentedControl({ value, onChange, options }) {
  return (
    <div className="flex rounded-md border bg-card p-0.5">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          title={option.hint}
          onClick={() => onChange(option.key)}
          className={cn(
            'rounded px-3 py-1 text-[12.5px] font-medium transition-colors',
            value === option.key
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function AddRedlineDialog({ open, onClose, selection, sections, currentSection, onSubmit }) {
  const [title, setTitle] = useState('')
  const [proposed, setProposed] = useState('')
  const [rationale, setRationale] = useState('')
  const [classification, setClassification] = useState('NEGOTIABLE')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle('')
      setProposed(selection?.text || '')
      setRationale('')
      setClassification('NEGOTIABLE')
    }
  }, [open, selection])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit({
        clause_title: title.trim() || 'Reviewer note',
        classification,
        doc_section: selection ? undefined : currentSection,
        block_start: selection?.blockStart ?? null,
        block_end: selection?.blockEnd ?? null,
        original_text: selection?.text || '',
        proposed_text: proposed.trim() || null,
        rationale: rationale.trim() || null,
      })
    } catch (err) {
      window.alert(err?.response?.data?.detail || 'Could not add the redline.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a redline"
      description={
        selection
          ? `Anchored to the text you selected (blocks ${selection.blockStart}-${selection.blockEnd}).`
          : 'Not anchored to any clause — use this to raise a protection the contract is missing.'
      }
      maxWidth={620}
    >
      <form onSubmit={submit} className="space-y-3.5">
        <div>
          <label className="label">Title</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Insurance requirements"
            autoFocus
          />
        </div>

        <div>
          <label className="label">Assessment</label>
          <select
            className="input"
            value={classification}
            onChange={(e) => setClassification(e.target.value)}
          >
            <option value="UNACCEPTABLE">Unacceptable</option>
            <option value="NEGOTIABLE">Negotiable</option>
            <option value="MISSING">Missing protection</option>
            <option value="ACCEPTABLE">Acceptable</option>
          </select>
        </div>

        {selection?.text && (
          <div>
            <label className="label">Selected text</label>
            <p className="max-h-24 overflow-y-auto rounded-md border bg-secondary p-2.5 text-[12px] leading-relaxed text-muted-foreground">
              {selection.text}
            </p>
          </div>
        )}

        <div>
          <label className="label">Proposed wording</label>
          <textarea
            className="input h-auto min-h-[120px] resize-y py-2 text-[12.5px] leading-relaxed"
            value={proposed}
            onChange={(e) => setProposed(e.target.value)}
            placeholder="The replacement clause text"
          />
        </div>

        <div>
          <label className="label">Rationale</label>
          <textarea
            className="input h-auto min-h-[70px] resize-y py-2 text-[12.5px] leading-relaxed"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Why this matters — becomes the margin comment in Word"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add redline
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function CenterMessage({ children }) {
  return (
    <div className="flex h-[calc(100svh-3.5rem)] items-center justify-center bg-background">
      <div className="text-center">{children}</div>
    </div>
  )
}
