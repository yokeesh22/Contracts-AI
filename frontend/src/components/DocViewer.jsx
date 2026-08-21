import { useEffect, useState } from 'react'
import { Download, FileText, RefreshCw } from 'lucide-react'

/**
 * Inline document viewer for the analysis detail page.
 *
 * - PDF  → native browser viewer in an <iframe>
 * - DOCX → converted to HTML client-side with mammoth.js (vendored at
 *   public/vendor/mammoth.browser.min.js — no build-time dependency)
 *   and rendered as a white "sheet" like a word processor page.
 * - Anything else (legacy .doc) → download fallback.
 */

let mammothPromise = null

function loadMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth)
  if (!mammothPromise) {
    mammothPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = '/vendor/mammoth.browser.min.js'
      script.onload = () => resolve(window.mammoth)
      script.onerror = () => {
        mammothPromise = null
        reject(new Error('Failed to load DOCX renderer'))
      }
      document.head.appendChild(script)
    })
  }
  return mammothPromise
}

const ext = (name) => (name || '').toLowerCase().split('.').pop()

export default function DocViewer({ url, fileName, label, page }) {
  const kind = ext(fileName)

  if (!url) return <Fallback fileName={fileName} />
  if (kind === 'pdf') {
    // #page=N drives the browser's built-in PDF viewer; keying the iframe
    // on the full src forces a reload so page jumps always take effect.
    const src = page ? `${url}#page=${page}` : url
    return <iframe key={src} src={src} title={label || fileName} className="h-full w-full border-0" />
  }
  if (kind === 'docx') return <DocxViewer key={url} url={url} fileName={fileName} />
  return <Fallback fileName={fileName} url={url} />
}

function DocxViewer({ url, fileName }) {
  const [html, setHtml] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setError(null)
    ;(async () => {
      try {
        const [mammoth, resp] = await Promise.all([loadMammoth(), fetch(url)])
        if (!resp.ok) throw new Error(`Failed to fetch document (${resp.status})`)
        const arrayBuffer = await resp.arrayBuffer()
        const result = await mammoth.convertToHtml({ arrayBuffer })
        if (!cancelled) setHtml(result.value)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to render document')
      }
    })()
    return () => { cancelled = true }
  }, [url])

  if (error) return <Fallback fileName={fileName} url={url} note={error} />

  if (html === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">Rendering document…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto px-5 py-6">
      <div
        className="docx-sheet mx-auto rounded-sm bg-white shadow-2xl"
        style={{ maxWidth: 820, padding: '48px 56px' }}
      >
        {/* mammoth output is plain formatting markup derived from the
            uploaded document itself */}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <style>{`
        .docx-sheet { font-family: 'DM Sans', system-ui, sans-serif; color: #1a2332; font-size: 13.5px; line-height: 1.65; }
        .docx-sheet h1 { font-size: 22px; font-weight: 600; margin: 20px 0 10px; letter-spacing: -0.01em; }
        .docx-sheet h2 { font-size: 18px; font-weight: 600; margin: 18px 0 8px; }
        .docx-sheet h3 { font-size: 15.5px; font-weight: 600; margin: 14px 0 6px; }
        .docx-sheet h4, .docx-sheet h5, .docx-sheet h6 { font-size: 13.5px; font-weight: 600; margin: 12px 0 4px; }
        .docx-sheet p { margin: 0 0 9px; }
        .docx-sheet ul, .docx-sheet ol { margin: 0 0 10px; padding-left: 22px; }
        .docx-sheet li { margin-bottom: 3px; }
        .docx-sheet table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 12.5px; }
        .docx-sheet td, .docx-sheet th { border: 1px solid #d7dde6; padding: 6px 9px; vertical-align: top; }
        .docx-sheet th { background: #f4f6f9; font-weight: 600; text-align: left; }
        .docx-sheet img { max-width: 100%; height: auto; }
        .docx-sheet a { color: #016ac9; }
        .docx-sheet strong { font-weight: 600; }
      `}</style>
    </div>
  )
}

function Fallback({ fileName, url, note }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" />
        <p className="text-[13.5px] font-medium text-foreground">{fileName || 'Document'}</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {note || 'Inline preview is not available for this file type.'}
        </p>
        {url && (
          <a href={url} download className="btn-secondary mt-4 inline-flex">
            <Download className="h-4 w-4" />
            Download document
          </a>
        )}
      </div>
    </div>
  )
}
