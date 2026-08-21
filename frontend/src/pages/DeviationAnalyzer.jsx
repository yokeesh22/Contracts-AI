import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Play, Trash2, RefreshCw, AlertCircle, Search, Filter, FileDown, GitCompare,
} from 'lucide-react'
import FileUpload from '../components/FileUpload'
import StatusBadge from '../components/StatusBadge'
import PageLayout from '../components/PageLayout'
import Dialog from '../components/Dialog'
import DataTable from '../components/DataTable'
import {
  getSpecifications,
  getSessions,
  createAnalysis,
  exportExceptionList,
  deleteSession,
} from '../services/api'

const STATUS_FILTERS = ['all', 'completed', 'analyzing', 'failed', 'pending']

const SUMMARY_CHIPS = [
  { key: 'total',     label: 'Total',       bg: '#e8f2fc', color: '#016ac9', border: '#bfdbfe' },
  { key: 'completed', label: 'Completed',   bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  { key: 'analyzing', label: 'In Progress', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  { key: 'failed',    label: 'Failed',      bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
]

export default function DeviationAnalyzer() {
  const navigate = useNavigate()

  // Specs available for selection
  const [specs, setSpecs] = useState([])

  // New analysis dialog
  const [showForm, setShowForm] = useState(false)
  const [selectedSpecId, setSelectedSpecId] = useState('')
  const [ursName, setUrsName] = useState('')
  const [ursFile, setUrsFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [formError, setFormError] = useState('')

  // Sessions list
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const loadSpecs = useCallback(async () => {
    try {
      const data = await getSpecifications()
      setSpecs(data.filter((s) => s.extraction_status === 'completed'))
    } catch { /* silent */ }
  }, [])

  const loadSessions = useCallback(async () => {
    try {
      const data = await getSessions()
      setSessions(data)
    } catch { /* silent */ }
    finally { setSessionsLoading(false) }
  }, [])

  useEffect(() => {
    loadSpecs()
    loadSessions()
    const interval = setInterval(loadSessions, 5000)
    return () => clearInterval(interval)
  }, [loadSpecs, loadSessions])

  const closeForm = () => {
    setShowForm(false)
    setFormError('')
    setUrsFile(null)
    setUrsName('')
    setSelectedSpecId('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedSpecId) { setFormError('Please select a specification.'); return }
    if (!ursFile) { setFormError('Please upload a URS document.'); return }
    // Name is optional — default to the uploaded file's name (sans extension).
    const name = ursName.trim() || ursFile.name.replace(/\.[^.]+$/, '')
    setFormError('')
    setUploading(true)
    setUploadProgress(0)
    try {
      await createAnalysis(
        Number(selectedSpecId),
        name,
        ursFile,
        setUploadProgress,
      )
      closeForm()
      // The analysis runs server-side in the background; the table below
      // polls every 5s, so the new session appears immediately as Pending
      // and updates on its own.
      loadSessions()
    } catch (err) {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map((d) => d.msg || JSON.stringify(d)).join('; ')
        : detail || err.message || 'Failed to start analysis. Please try again.'
      setFormError(msg)
    } finally {
      setUploading(false)
    }
  }

  const handleExport = async (id) => {
    await exportExceptionList(id).catch(() => alert('Export failed.'))
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this analysis session and all its results?')) return
    await deleteSession(id).catch(() => {})
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }

  const filtered = sessions.filter((s) => {
    const matchSearch = s.urs_name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    return matchSearch && matchStatus
  })

  const counts = {
    completed: filtered.filter((s) => s.status === 'completed').length,
    analyzing: filtered.filter((s) => ['analyzing', 'extracting'].includes(s.status)).length,
    failed: filtered.filter((s) => s.status === 'failed').length,
  }

  const columns = [
    {
      key: 'urs_name',
      header: 'URS / Document',
      render: (session) => {
        const isRunning = ['pending', 'extracting', 'analyzing'].includes(session.status)
        const pct = session.total_requirements > 0
          ? Math.round((session.analyzed_count / session.total_requirements) * 100)
          : 0
        return (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-foreground">{session.urs_name}</p>
            <p className="truncate text-xs text-muted-foreground">{session.urs_file_name}</p>
            {isRunning && session.total_requirements > 0 && (
              <div className="mt-2 max-w-[280px] space-y-1">
                <div className="h-1 w-full rounded-full bg-muted">
                  <div className="h-1 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {session.analyzed_count}/{session.total_requirements} analyzed
                </p>
              </div>
            )}
            {session.error_message && (
              <p className="mt-1 max-w-[280px] truncate text-xs" style={{ color: '#b91c1c' }} title={session.error_message}>
                {session.error_message}
              </p>
            )}
          </div>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-32',
      render: (session) => <StatusBadge status={session.status} />,
    },
    {
      key: 'requirements',
      header: 'Requirements',
      className: 'w-32 text-center',
      cellClassName: 'text-center',
      render: (session) => (
        <span className="font-mono-num tabular-nums">
          <span className="text-[14px] text-foreground/85">{session.analyzed_count}</span>
          <span className="text-xs text-muted-foreground"> / {session.total_requirements}</span>
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Date',
      className: 'w-40',
      render: (session) => (
        <div>
          <p className="text-xs text-foreground/85">{new Date(session.created_at).toLocaleDateString()}</p>
          <p className="text-xs text-muted-foreground">{new Date(session.created_at).toLocaleTimeString()}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'w-28 text-right',
      cellClassName: 'text-right',
      render: (session) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {session.status === 'completed' && (
            <button
              className="rounded-md p-1.5 text-primary transition-colors hover:bg-accent"
              title="Download Exception List"
              onClick={() => handleExport(session.id)}
            >
              <FileDown className="h-4 w-4" />
            </button>
          )}
          <button
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
            title="Delete session"
            onClick={() => handleDelete(session.id)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <PageLayout
      title="Deviation Analysis"
      subtitle="Compare customer URS documents against technical specifications and review deviations."
      breadcrumbs={[{ label: 'Home' }, { label: 'Deviation Analysis' }]}
      actions={
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Play className="h-4 w-4" />
          New Analysis
        </button>
      }
    >
      <div className="space-y-3.5">
        {/* Summary chips */}
        <div className="flex flex-wrap gap-2.5">
          {SUMMARY_CHIPS.map(({ key, label, bg, color, border }) => {
            const count = key === 'total' ? filtered.length : counts[key]
            return (
              <div
                key={key}
                className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium"
                style={{ background: bg, color, borderColor: border }}
              >
                <span className="font-mono-num text-base font-medium tabular-nums">{count}</span>
                {label}
              </div>
            )
          })}
        </div>

        {/* Filters bar */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input pl-9"
              placeholder="Search by URS / document name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <select
              className="input w-auto"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sessions table */}
        {sessionsLoading ? (
          <div className="card py-12 text-center">
            <RefreshCw className="mx-auto mb-3 h-7 w-7 animate-spin text-muted-foreground" />
            <p className="text-[13px] text-muted-foreground">Loading analyses…</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            onRowClick={(session) => navigate(`/analysis/${session.id}`)}
            emptyMessage={
              search || statusFilter !== 'all'
                ? 'No analyses match your filters.'
                : 'No analyses yet. Start a new analysis to generate your first Customer Exception List.'
            }
          />
        )}
      </div>

      {/* New analysis dialog */}
      <Dialog
        open={showForm}
        onClose={uploading ? undefined : closeForm}
        title="Configure Deviation Analysis"
        icon={GitCompare}
        description="Upload a URS document and select the specification to compare it against."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Spec selector */}
          <div>
            <label className="label">Technical Specification *</label>
            {specs.length === 0 ? (
              <div
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]"
                style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                No completed specifications found. Upload and extract a specification first.
              </div>
            ) : (
              <select
                className="input"
                value={selectedSpecId}
                onChange={(e) => setSelectedSpecId(e.target.value)}
                disabled={uploading}
              >
                <option value="">— Select a specification —</option>
                {specs.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* URS name */}
          <div>
            <label className="label">URS / Customer Document Name</label>
            <input
              className="input"
              placeholder="Optional — defaults to the uploaded file name"
              value={ursName}
              onChange={(e) => setUrsName(e.target.value)}
              disabled={uploading}
            />
          </div>

          {/* URS file upload */}
          <div>
            <label className="label">URS Document *</label>
            <FileUpload
              selectedFile={ursFile}
              onFileSelect={setUrsFile}
              label="Drop the URS document here or click to browse"
            />
          </div>

          {formError && (
            <div
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]"
              style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {formError}
            </div>
          )}

          {uploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading document…</span>
                <span className="font-mono-num">{uploadProgress}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t pt-4">
            <button type="button" className="btn-secondary" onClick={closeForm} disabled={uploading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={uploading || specs.length === 0}>
              {uploading
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Starting…</>
                : <><Play className="h-4 w-4" /> Start Analysis</>}
            </button>
          </div>
        </form>
      </Dialog>
    </PageLayout>
  )
}
