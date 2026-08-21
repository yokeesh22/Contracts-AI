import { useEffect, useState } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'

/**
 * The uploaded file as it actually looks, rather than the extracted text.
 *
 * The redlining views deliberately render our own block model, because the
 * export has to write revisions into the same paragraphs the reader saw. But a
 * reviewer still needs to check the real document — signatures, logos, layout,
 * anything extraction flattens — so this shows the file itself.
 *
 *   PDF  -> the browser's native viewer, pixel-accurate
 *   DOCX -> converted client-side by mammoth; structure and tables survive,
 *           exact page layout does not (nothing in a browser can do better
 *           without a server-side render).
 */
export default function SourceDocument({ url, fileName, docKind }) {
  if (!url) {
    return <Message>The uploaded file is not available.</Message>
  }

  if (docKind === 'pdf') {
    return (
      <iframe
        src={url}
        title={fileName || 'Contract'}
        className="h-full w-full border-0"
      />
    )
  }

  return <DocxPreview url={url} fileName={fileName} />
}

function DocxPreview({ url, fileName }) {
  const [html, setHtml] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setError(null)

    ;(async () => {
      try {
        // Imported lazily so the converter is only fetched when someone
        // actually opens a Word document.
        const [{ default: mammoth }, response] = await Promise.all([
          import('mammoth/mammoth.browser'),
          fetch(url),
        ])
        if (!response.ok) throw new Error(`Could not fetch the file (${response.status})`)
        const buffer = await response.arrayBuffer()
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
        if (!cancelled) setHtml(result.value)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not render this document.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [url])

  if (error) {
    return (
      <Message>
        {error}
        <a href={url} download={fileName} className="mt-3 inline-flex btn-secondary h-8 px-3 text-[13px]">
          <Download className="h-3.5 w-3.5" />
          Download instead
        </a>
      </Message>
    )
  }

  if (html === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* eslint-disable-next-line react/no-danger -- mammoth sanitises to a
          fixed tag whitelist, and the source is a file the user uploaded. */}
      <div className="doc-sheet doc-source" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

function Message({ children }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center text-[13px] text-muted-foreground">
      <FileText className="mb-2 h-8 w-8 opacity-40" />
      {children}
    </div>
  )
}
