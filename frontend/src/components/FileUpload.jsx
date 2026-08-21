import { useRef, useState } from 'react'
import { UploadCloud, File, X } from 'lucide-react'

export default function FileUpload({
  accept = '.pdf,.docx',
  onFileSelect,
  selectedFile,
  label = 'Drop file here or click to browse',
  hint = 'Supported: DOCX, PDF',
}) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = (file) => {
    if (file) onFileSelect(file)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }

  const onDragOver = (e) => {
    e.preventDefault()
    setDragging(true)
  }

  return (
    <div>
      {selectedFile ? (
        <div
          className="flex items-center gap-3 rounded-lg border p-4"
          style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}
        >
          <File className="w-5 h-5 flex-shrink-0" style={{ color: '#15803d' }} />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium" style={{ color: '#15803d' }}>{selectedFile.name}</p>
            <p className="font-mono-num text-xs" style={{ color: '#16a34a' }}>{(selectedFile.size / 1024).toFixed(1)} KB</p>
          </div>
          <button
            type="button"
            onClick={() => onFileSelect(null)}
            className="rounded-md p-1 transition-colors hover:bg-white/70"
            style={{ color: '#15803d' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={() => setDragging(false)}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
            dragging
              ? 'border-primary bg-accent'
              : 'border-input bg-secondary hover:border-primary hover:bg-accent'
          }`}
        >
          <UploadCloud className={`h-8 w-8 ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
          <p className="text-center text-[13px] text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
          />
        </div>
      )}
    </div>
  )
}
