import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Download, FileText, RefreshCw, Trash2, ListChecks,
} from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import ExceptionTable from '../components/ExceptionTable'
import DocViewer from '../components/DocViewer'
import {
  getSession,
  exportExceptionList,
  deleteSession,
  specFileUrl,
  ursFileUrl,
} from '../services/api'
import { cn } from '../lib/utils'

const RUNNING_STATUSES = ['pending', 'extracting', 'analyzing']

/**
 * Full-height analysis view, modelled on the IDP DocumentViewer page:
 * h-14 toolbar (back · title · status · actions), then a 50-50 split —
 * document on the left (switchable between Specification and URS),
 * deviations on the right.
 */
export default function AnalysisDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [docTab, setDocTab] = useState('spec') // 'spec' | 'urs'
  const [ursPage, setUrsPage] = useState(null) // page deep-link for the URS PDF

  const load = useCallback(async () => {
    try {
      const data = await getSession(id)
      setSession(data)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // Poll while the analysis is still running so results stream in.
  useEffect(() => {
    if (!session || !RUNNING_STATUSES.includes(session.status)) return
    const iv = setInterval(load, 4000)
    return () => clearInterval(iv)
  }, [session, load])

  const handleExport = () =>
    exportExceptionList(session.id).catch(() => alert('Export failed.'))

  const handleDelete = async () => {
    if (!confirm('Delete this analysis session and all its results?')) return
    await deleteSession(session.id).catch(() => {})
    navigate('/analysis')
  }

  if (loadError) {
    return (
      <CenterMessage>
        <p className="mb-3 text-[13.5px] font-medium text-destructive">Failed to load analysis</p>
        <button className="btn-secondary" onClick={() => navigate('/analysis')}>
          <ArrowLeft className="h-4 w-4" /> Back to Deviation Analysis
        </button>
      </CenterMessage>
    )
  }

  if (!session) {
    return (
      <CenterMessage>
        <RefreshCw className="mx-auto mb-3 h-7 w-7 animate-spin text-muted-foreground" />
        <p className="text-[13px] text-muted-foreground">Loading analysis…</p>
      </CenterMessage>
    )
  }

  const isRunning = RUNNING_STATUSES.includes(session.status)
  const pct = session.total_requirements > 0
    ? Math.round((session.analyzed_count / session.total_requirements) * 100)
    : 0

  const doc = docTab === 'spec'
    ? {
        url: session.spec_id ? specFileUrl(session.spec_id) : null,
        name: session.specification?.file_name,
        label: session.specification?.name || 'Specification',
      }
    : {
        url: ursFileUrl(session.id),
        name: session.urs_file_name,
        label: session.urs_name,
      }

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4">
        <button
          type="button"
          onClick={() => navigate('/analysis')}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Back to Deviation Analysis"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="h-5 w-px bg-border" />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileText className="h-3.5 w-3.5 shrink-0 text-primary/70" />
          <span className="truncate text-[13px] font-semibold">{session.urs_name}</span>
          <StatusBadge status={session.status} />
          {isRunning && session.total_requirements > 0 && (
            <span className="font-mono-num whitespace-nowrap text-xs text-muted-foreground">
              {session.analyzed_count}/{session.total_requirements} ({pct}%)
            </span>
          )}
        </div>

        <div className="h-5 w-px bg-border" />

        {session.status === 'completed' && (
          <button
            type="button"
            onClick={handleExport}
            className="flex h-7 items-center gap-1.5 rounded border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-accent hover:text-primary"
          >
            <Download className="h-3.5 w-3.5" />
            Export Exception List
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
          title="Delete session"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Split body */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Left: document viewer */}
        <div className="flex w-1/2 flex-col border-r" style={{ background: '#f7f4f4' }}>
          {/* Tab strip: which document to view (h-10 to line up with the
              Deviations header on the right pane) */}
          <div className="flex h-10 shrink-0 overflow-x-auto border-b bg-secondary">
            <DocTab
              active={docTab === 'spec'}
              onClick={() => setDocTab('spec')}
              label="Specification"
              sub={session.specification?.name}
            />
            <DocTab
              active={docTab === 'urs'}
              onClick={() => setDocTab('urs')}
              label="URS Document"
              sub={session.urs_name}
            />
          </div>

          <div className="min-h-0 flex-1">
            <DocViewer
              url={doc.url}
              fileName={doc.name}
              label={doc.label}
              page={docTab === 'urs' ? ursPage : null}
            />
          </div>
        </div>

        {/* Right: deviations */}
        <div className="flex w-1/2 flex-col overflow-hidden bg-card">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-card px-4">
            <ListChecks className="h-[15px] w-[15px] text-primary" />
            <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Deviations
            </span>
            <span className="font-mono-num text-xs text-muted-foreground">
              {session.requirements?.length ?? 0} requirements
            </span>
          </div>

          {isRunning && (
            <div className="shrink-0 border-b px-4 py-2.5">
              <div
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]"
                style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}
              >
                <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
                Analysis in progress — results appear as each requirement is processed.
              </div>
              {session.total_requirements > 0 && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          )}

          {session.error_message && (
            <div className="shrink-0 border-b px-4 py-2.5">
              <div
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]"
                style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
              >
                {session.error_message}
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <ExceptionTable
              requirements={session.requirements || []}
              onPageClick={(page) => {
                // Jump the left pane to the URS document at that page.
                setDocTab('urs')
                setUrsPage(page)
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function DocTab({ active, onClick, label, sub }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={sub}
      className={cn(
        'flex h-full min-w-0 items-center gap-1.5 border-b-2 px-4 text-[13px] font-medium transition-colors',
        active
          ? 'border-primary bg-card text-primary'
          : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <FileText className="h-[15px] w-[15px] shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

function CenterMessage({ children }) {
  return (
    <div className="flex h-[calc(100svh-3.5rem)] items-center justify-center bg-background">
      <div className="text-center">{children}</div>
    </div>
  )
}
