import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, FileText, AlertCircle, RefreshCw, Eye, Upload } from 'lucide-react'
import FileUpload from '../components/FileUpload'
import StatusBadge from '../components/StatusBadge'
import PageLayout from '../components/PageLayout'
import Dialog from '../components/Dialog'
import DataTable from '../components/DataTable'
import {
  getSpecifications,
  uploadSpecification,
  deleteSpecification,
  getSpecification,
} from '../services/api'

export default function SpecificationManager() {
  const [specs, setSpecs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')
  const [previewSpec, setPreviewSpec] = useState(null)

  const loadSpecs = useCallback(async () => {
    try {
      const data = await getSpecifications()
      setSpecs(data)
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSpecs()
    const interval = setInterval(loadSpecs, 5000)
    return () => clearInterval(interval)
  }, [loadSpecs])

  const closeUpload = () => {
    setShowUpload(false)
    setError('')
    setFile(null)
    setName('')
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('A specification document is required.')
      return
    }
    // Name is optional — default to the uploaded file's name (sans extension).
    const specName = name.trim() || file.name.replace(/\.[^.]+$/, '')
    setError('')
    setUploading(true)
    setUploadProgress(0)
    try {
      await uploadSpecification(specName, file, setUploadProgress)
      closeUpload()
      loadSpecs()
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (spec) => {
    if (!confirm(`Delete specification "${spec.name}"? This cannot be undone.`)) return
    try {
      await deleteSpecification(spec.id)
      setSpecs((prev) => prev.filter((s) => s.id !== spec.id))
    } catch {
      alert('Delete failed.')
    }
  }

  const openPreview = async (spec) => {
    setPreviewSpec({ ...spec, extracted_text: null })
    const detail = await getSpecification(spec.id).catch(() => null)
    setPreviewSpec(detail ? detail : null)
  }

  const columns = [
    {
      key: 'name',
      header: 'Specification',
      render: (spec) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-accent">
            <FileText className="h-4 w-4 text-accent-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-foreground">{spec.name}</p>
            <p className="truncate text-xs text-muted-foreground">{spec.file_name}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-36',
      render: (spec) => (
        <div>
          <StatusBadge status={spec.extraction_status} />
          {spec.error_message && (
            <p className="mt-1 max-w-[220px] truncate text-xs" style={{ color: '#b91c1c' }} title={spec.error_message}>
              {spec.error_message}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Uploaded',
      className: 'w-40',
      render: (spec) => (
        <div>
          <p className="text-xs text-foreground/85">{new Date(spec.created_at).toLocaleDateString()}</p>
          <p className="text-xs text-muted-foreground">{new Date(spec.created_at).toLocaleTimeString()}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'w-28 text-right',
      cellClassName: 'text-right',
      render: (spec) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {spec.extraction_status === 'completed' && (
            <button
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
              title="Preview extracted text"
              onClick={() => openPreview(spec)}
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
          <button
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
            title="Delete specification"
            onClick={() => handleDelete(spec)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <PageLayout
      title="Specifications"
      subtitle="Upload and manage technical specification documents used for deviation analysis."
      breadcrumbs={[{ label: 'Home' }, { label: 'Specifications' }]}
      actions={
        <button className="btn-primary" onClick={() => setShowUpload(true)}>
          <Plus className="h-4 w-4" />
          Upload Specification
        </button>
      }
    >
      {loading ? (
        <div className="card py-12 text-center">
          <RefreshCw className="mx-auto mb-3 h-7 w-7 animate-spin text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">Loading specifications…</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={specs}
          emptyMessage="No specifications yet. Upload your first technical specification to get started."
        />
      )}

      {/* Upload dialog */}
      <Dialog
        open={showUpload}
        onClose={uploading ? undefined : closeUpload}
        title="Upload Technical Specification"
        icon={Upload}
        description="The document is extracted automatically after upload and becomes available for analysis."
      >
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="label">Specification Name</label>
            <input
              className="input"
              placeholder="Optional — defaults to the uploaded file name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={uploading}
            />
          </div>
          <div>
            <label className="label">Document File *</label>
            <FileUpload
              selectedFile={file}
              onFileSelect={setFile}
              label="Drop the specification document here or click to browse"
            />
          </div>
          {error && (
            <div
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]"
              style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {uploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading…</span>
                <span className="font-mono-num">{uploadProgress}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t pt-4">
            <button type="button" className="btn-secondary" onClick={closeUpload} disabled={uploading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={uploading}>
              {uploading ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Uploading…</>
              ) : (
                <><Upload className="h-4 w-4" /> Upload &amp; Extract</>
              )}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Extracted text preview dialog */}
      <Dialog
        open={!!previewSpec}
        onClose={() => setPreviewSpec(null)}
        title={previewSpec?.name || 'Extracted Text'}
        icon={FileText}
        description="Extracted text preview (first 3,000 characters)."
        maxWidth={720}
      >
        {previewSpec?.extracted_text === null ? (
          <div className="flex items-center gap-2 py-6 text-[13px] text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading preview…
          </div>
        ) : (
          <pre className="font-mono-num max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-lg border bg-secondary p-4 text-xs text-foreground">
            {previewSpec?.extracted_text
              ? previewSpec.extracted_text.slice(0, 3000) +
                (previewSpec.extracted_text.length > 3000 ? '\n…[truncated]' : '')
              : 'No extracted text available.'}
          </pre>
        )}
      </Dialog>
    </PageLayout>
  )
}
