import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSignature, Loader2, Plus, Trash2 } from 'lucide-react'
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

const RUNNING = ['pending', 'extracting', 'analyzing']

export default function ContractReviews() {
  const navigate = useNavigate()
  const [reviews, setReviews] = useState([])
  const [playbooks, setPlaybooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

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

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm('Delete this review and all of its findings?')) return
    await deleteReview(id)
    setReviews((prev) => prev.filter((r) => r.id !== id))
  }

  const columns = [
    {
      key: 'name',
      header: 'Contract',
      render: (row) => (
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-foreground">{row.name}</div>
          <div className="truncate text-xs text-muted-foreground">{row.file_name}</div>
        </div>
      ),
    },
    {
      key: 'counterparty',
      header: 'Counterparty',
      className: 'w-48',
      render: (row) => (
        <span className="text-[13px] text-muted-foreground">{row.counterparty || '—'}</span>
      ),
    },
    {
      key: 'doc_kind',
      header: 'Source',
      className: 'w-24',
      render: (row) => (
        <span
          className="font-mono-num text-xs uppercase text-muted-foreground"
          title={
            row.doc_kind === 'pdf'
              ? 'PDF upload — the exported redline cannot preserve formatting'
              : 'Word upload — full tracked-changes export'
          }
        >
          {row.doc_kind}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-36',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'findings',
      header: 'Findings',
      className: 'w-28',
      render: (row) => (
        <span className="font-mono-num text-[13px] text-foreground">
          {RUNNING.includes(row.status)
            ? `${row.analyzed_count}/${row.total_clauses || '?'}`
            : row.total_clauses}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      className: 'w-36',
      render: (row) => (
        <span className="font-mono-num text-xs text-muted-foreground">
          {new Date(row.created_at).toLocaleDateString()}
        </span>
      ),
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
      subtitle="Upload a contract to redline it against a playbook"
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
