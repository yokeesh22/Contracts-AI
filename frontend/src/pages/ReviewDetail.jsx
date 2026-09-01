import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Download,
  ListChecks,
  Loader2,
  Send,
  Undo2,
  Upload,
} from 'lucide-react'
import ContractViewer from '../components/ContractViewer'
import ErrorBoundary from '../components/ErrorBoundary'
import FileUpload from '../components/FileUpload'
import SourceDocument from '../components/SourceDocument'
import RedlineList from '../components/RedlineList'
import FindingsToolbar from '../components/FindingsToolbar'
import RoundPicker from '../components/RoundPicker'
import Menu, { MenuItem } from '../components/Menu'
import Dialog from '../components/Dialog'
import StatusBadge from '../components/StatusBadge'
import {
  addRound,
  contractFileUrl,
  createRedline,
  deleteRedline,
  exportIssues,
  exportRedline,
  getReview,
  markComplete,
  markSentToVendor,
  setReviewStatus,
  updateRedline,
} from '../services/api'
import { waitingLabel } from '../lib/classifications'
import { partition } from '../lib/findings'
import { cn } from '../lib/utils'

const VIEW_MODES = [
  { key: 'source', label: 'Source', hint: 'The uploaded PDF or Word file itself.' },
  { key: 'original', label: 'Original', hint: 'Extracted text, exactly as received.' },
  { key: 'redlined', label: 'Redlined', hint: 'Our proposed changes, marked up.' },
  { key: 'final', label: 'Final', hint: 'Every kept change applied, read clean.' },
]

const RUNNING = ['queued', 'pending', 'extracting', 'analyzing']

export default function ReviewDetail() {
  const { id } = useParams()
  // ?version= lets the reviews list deep-link straight into a specific round.
  const [searchParams, setSearchParams] = useSearchParams()
  const [review, setReview] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('redlined')
  const [section, setSection] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [exporting, setExporting] = useState(null)
  const [exportError, setExportError] = useState(null)
  const [selection, setSelection] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [roundOpen, setRoundOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // null means "whatever the latest round is", so a finishing round pulls the
  // view forward on its own instead of stranding the reviewer on the old one.
  // Filter state lives here rather than in the findings pane, because the chips
  // that drive it sit in a row shared with the document pane's toolbar.
  const [severity, setSeverity] = useState(null)
  const [showIgnored, setShowIgnored] = useState(false)
  const [versionId, setVersionId] = useState(() => {
    const raw = searchParams.get('version')
    return raw ? Number(raw) : null
  })
  const pollRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const data = await getReview(id, versionId)
      setReview(data)
      setSection((prev) => prev ?? data.sections?.[0] ?? null)
      return data
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load this review.')
      return null
    }
  }, [id, versionId])

  useEffect(() => {
    load()
  }, [load])

  const version = review?.version
  const versions = review?.versions ?? []
  const isLatest = !version || version.id === versions[versions.length - 1]?.id
  const roundDone = version?.status === 'completed'
  const isRunning = Boolean(version && RUNNING.includes(version.status))
  // A past round is a record of what was asked at the time. Editing it would
  // build a redline against a document the counterparty has already replaced.
  const readOnly = !isLatest || review?.status === 'completed'

  // Poll while the analysis is in flight so findings stream in as they land.
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

  const allRedlines = review?.redlines ?? []
  const findings = partition(allRedlines, { severity, showIgnored })

  const selectRound = (nextId) => {
    const latestId = versions[versions.length - 1]?.id
    const next = nextId === latestId ? null : nextId
    setVersionId(next)
    setSearchParams(next ? { version: String(next) } : {}, { replace: true })
    setActiveId(null)
    setSection(null)
    // Severity buckets differ between the opening paper and a vendor round, so
    // a filter carried across would silently hide everything.
    setSeverity(null)
    setShowIgnored(false)
  }

  const handleUpdate = async (redlineId, patch) => {
    const updated = await updateRedline(id, redlineId, patch)
    setReview((prev) => ({
      ...prev,
      // The negotiation may have moved to In Process on the first edit, so the
      // header has to follow rather than showing a status that is now stale.
      status: prev.status === 'ai_completed' ? 'in_process' : prev.status,
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

  // Downloading never interrupts. A failure is reported inline in the header
  // rather than in a dialog, so the one case that genuinely needs saying is
  // still said without a click standing between the user and their file.
  // Downloading never interrupts. A failure is reported inline in the header
  // rather than in a dialog, so the one case that genuinely needs saying is
  // still said without a click standing between the user and their file.
  //
  // `markSent` folds the one status the app cannot observe into the action that
  // always precedes it. Downloading the redline and then telling the app you
  // sent it were two steps that were always taken together, and separating them
  // meant the second was the one people forgot.
  const handleExport = async (kind, { markSent = false } = {}) => {
    setExporting(kind)
    setExportError(null)
    try {
      if (kind === 'issues') {
        await exportIssues(id, version?.id)
      } else {
        await exportRedline(id, version?.id)
        if (markSent) {
          await markSentToVendor(id, { note: 'Redline downloaded and sent' })
          await load()
        }
      }
    } catch (e) {
      setExportError(e?.response?.data?.detail || 'Export failed.')
    } finally {
      setExporting(null)
    }
  }

  const runAction = async (fn) => {
    setBusy(true)
    try {
      await fn()
      await load()
    } catch (e) {
      window.alert(e?.response?.data?.detail || 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  const handleAddRound = async ({ file, note }, onProgress) => {
    await addRound({ reviewId: id, file, note }, onProgress)
    setRoundOpen(false)
    setVersionId(null)
    setActiveId(null)
    setSection(null)
    await load()
  }

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

  const completeNegotiation = () => {
    if (
      openIssues &&
      !window.confirm(
        `${openIssues} ${openIssues === 1 ? 'issue is' : 'issues are'} still open. ` +
          'Close the negotiation anyway?',
      )
    ) {
      return
    }
    runAction(() => markComplete(id))
  }

  const closed = review.status === 'completed'
  const waiting = review.status === 'pending_vendor' ? waitingLabel(review.sent_to_vendor_at) : null
  const openIssues =
    review.issues?.filter((i) => ['open', 'countered'].includes(i.status)).length ?? 0

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      {/* Identity on the left, then one named control per question a reviewer
          has: which version am I reading, what do I download, is this deal done.
          Nothing here is an unlabelled glyph — "mark complete" and "sent to
          vendor" are pressed once a round and decide what the other side
          receives, so they are the last things that should be a guess.

          Sending is not its own button: it is an option inside Download,
          because downloading the redline and telling the app you sent it were
          always the same act, and split in two the second half got forgotten.
          Uploading their reply lives in the round picker for the same reason —
          it is how a round begins. */}
      <div className="flex shrink-0 items-center gap-2.5 border-b bg-card px-5 py-2.5">
        <Link
          to="/reviews"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Back to reviews"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <h1
          className="min-w-0 truncate text-[15px] font-semibold leading-tight text-foreground"
          title={[
            review.counterparty,
            version?.file_name,
            review.playbook?.name && `reviewed against ${review.playbook.name}`,
            waiting && `waiting ${waiting}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        >
          {review.name}
        </h1>

        <StatusBadge status={review.status} />

        <div className="flex-1" />

        {exportError && (
          <span
            className="max-w-[220px] truncate text-[12px] text-destructive"
            title={exportError}
          >
            {exportError}
          </span>
        )}

        <RoundPicker versions={versions} selectedId={version?.id} onSelect={selectRound} />

        <Menu
          width={300}
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              disabled={!roundDone || Boolean(exporting)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40',
                open && 'bg-secondary',
              )}
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        >
          <MenuItem
            icon={Download}
            label="Redlined contract (.docx)"
            hint="The marked-up contract with Word tracked changes"
            onClick={() => handleExport('redline')}
          />
          <MenuItem
            icon={Send}
            label="Redlined contract, and mark as sent"
            hint="Downloads the same file and starts the clock on the counterparty"
            disabled={!isLatest || review.status === 'pending_vendor' || closed}
            onClick={() => handleExport('redline', { markSent: true })}
          />
          <MenuItem
            icon={ListChecks}
            label="Issues list (.docx)"
            hint="The tabular summary, for circulation internally"
            onClick={() => handleExport('issues')}
          />
        </Menu>

        <button
          type="button"
          className="btn-secondary h-8 px-3 text-[13px]"
          onClick={() => setRoundOpen(true)}
          disabled={closed || versions[versions.length - 1]?.status !== 'completed'}
          title="Upload the version the counterparty sent back — starts the next round"
        >
          <Upload className="h-3.5 w-3.5" />
          Vendor response
        </button>

        {closed ? (
          <button
            type="button"
            className="btn-secondary h-8 px-3 text-[13px]"
            onClick={() => runAction(() => setReviewStatus(id, 'in_process', 'Reopened'))}
            disabled={busy}
            title="Put this negotiation back in play"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
            Reopen
          </button>
        ) : (
          <button
            type="button"
            className="btn-secondary h-8 px-3 text-[13px]"
            onClick={completeNegotiation}
            disabled={busy}
            title={
              openIssues
                ? `${openIssues} still open — you will be asked to confirm`
                : 'Close this negotiation'
            }
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Mark complete
          </button>
        )}
      </div>

      {/* Both toolbars share one flex row, so they are exactly as tall as each
          other at every width without anything measuring anything. Each pane
          owning its own header meant they only lined up when the filter chips
          happened not to wrap. */}
      <div className="flex shrink-0 border-b">
        <div className="flex w-1/2 min-h-[44px] items-center gap-2 border-r bg-secondary px-3 py-1.5">
          <SegmentedControl value={mode} onChange={setMode} options={VIEW_MODES} />
          <div className="flex-1" />
          {review.sections?.length > 1 && (
            <select
              className="h-7 max-w-[240px] rounded-md border bg-card px-2 text-[12px] text-foreground outline-none"
              value={section || ''}
              onChange={(e) => setSection(e.target.value)}
              title="This upload contains several documents"
            >
              {review.sections.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex w-1/2 min-h-[44px] flex-wrap items-center gap-1.5 bg-card px-4 py-1.5">
          <FindingsToolbar
            redlines={allRedlines}
            severity={severity}
            setSeverity={setSeverity}
            canAdd={roundDone && !readOnly}
            onAdd={() => setAddOpen(true)}
            addHint={
              selection
                ? 'Add a redline on the text you selected'
                : 'Select text in the document first, or add an unanchored point'
            }
          />
        </div>
      </div>

      {/* Split body */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r" style={{ background: '#eef1f6' }}>
          <div className="min-h-0 flex-1">
            <ErrorBoundary label="The document could not be displayed">
              {mode === 'source' ? (
                <SourceDocument
                  url={contractFileUrl(review.id, version?.id)}
                  fileName={version?.file_name}
                  docKind={version?.doc_kind}
                />
              ) : (
                <ContractViewer
                  blocks={review.blocks}
                  redlines={review.redlines}
                  mode={mode}
                  section={section}
                  activeRedlineId={activeId}
                  onSelectRedline={selectRedline}
                  selectionEnabled={roundDone && !readOnly}
                  onSelectBlocks={setSelection}
                />
              )}
            </ErrorBoundary>
          </div>
        </div>

        <div className="flex w-1/2 flex-col overflow-hidden bg-background">
          {version?.error_message && (
            <div className="shrink-0 border-b bg-card px-4 py-2.5">
              <div
                className="flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]"
                style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
              >
                <AlertTriangle className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                {version.error_message}
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1">
            <ErrorBoundary label="The findings could not be displayed">
              <RedlineList
                redlines={findings.visible}
                ignored={findings.ignored}
                ignoredCount={findings.ignoredCount}
                showIgnored={showIgnored}
                onToggleIgnored={() => setShowIgnored((v) => !v)}
                total={allRedlines.length}
                activeRedlineId={activeId}
                onSelect={selectRedline}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                disabled={!roundDone}
                readOnly={readOnly}
                isRunning={isRunning}
              />
            </ErrorBoundary>
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

      <VendorResponseDialog
        open={roundOpen}
        onClose={() => setRoundOpen(false)}
        nextRound={(versions[versions.length - 1]?.round_number ?? 1) + 1}
        onSubmit={handleAddRound}
      />

      <SentToVendorDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        round={version?.round_number ?? 1}
        onSubmit={async ({ sentAt, note }) => {
          await runAction(() => markSentToVendor(id, { sentAt, note }))
          setSendOpen(false)
        }}
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

/** Upload the file the counterparty sent back and start the next round. */
function VendorResponseDialog({ open, onClose, nextRound, onSubmit }) {
  const [file, setFile] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (open) {
      setFile(null)
      setNote('')
      setProgress(0)
    }
  }, [open])

  const submit = async (e) => {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    try {
      await onSubmit({ file, note: note.trim() }, setProgress)
    } catch (err) {
      window.alert(err?.response?.data?.detail || 'Could not start the next round.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Upload the counterparty's response — round ${nextRound}`}
      icon={Upload}
      description="Word files with their tracked changes give the most precise comparison; a clean file or a PDF is compared on text alone."
      maxWidth={580}
    >
      <form onSubmit={submit} className="space-y-3.5">
        <div>
          <label className="label">Their returned document</label>
          <FileUpload
            accept=".pdf,.docx"
            selectedFile={file}
            onFileSelect={setFile}
            label="Drop the file they sent back"
            hint="Supported: DOCX, PDF"
          />
        </div>

        <div>
          <label className="label">Note (optional)</label>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Received from Morgan Nash, 24 Aug"
          />
        </div>

        <p className="rounded-md border bg-secondary p-2.5 text-[12px] leading-relaxed text-muted-foreground">
          Every point from the last round is checked against this file — accepted,
          countered, or left alone — and anything they added is reviewed fresh
          against the playbook.
        </p>

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
          <button type="submit" className="btn-primary" disabled={busy || !file}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Start round {nextRound}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/** The one status the app cannot observe for itself. */
function SentToVendorDialog({ open, onClose, round, onSubmit }) {
  const [sentAt, setSentAt] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setSentAt(new Date().toISOString().slice(0, 10))
      setNote('')
    }
  }, [open])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit({
        sentAt: sentAt ? new Date(`${sentAt}T12:00:00`).toISOString() : null,
        note: note.trim(),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Sent to vendor"
      icon={Send}
      description="Nothing here can see an email leave your outbox, so this is the one status you set by hand. The date starts the clock on the reviews list."
      maxWidth={480}
    >
      <form onSubmit={submit} className="space-y-3.5">
        <div>
          <label className="label">Date sent</label>
          <input
            type="date"
            className="input"
            value={sentAt}
            onChange={(e) => setSentAt(e.target.value)}
          />
        </div>
        <div>
          <label className="label">What went out (optional)</label>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={`e.g. Round ${round} redline + issues list to their counsel`}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Mark as sent
          </button>
        </div>
      </form>
    </Dialog>
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
