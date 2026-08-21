import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * Modal dialog shell matching the IDP dialog: dimmed backdrop, centered
 * card, bordered header with a 15px title and close button.
 *
 * Rendered through a portal on document.body — pages animate in with a
 * CSS transform (page-enter), and a transformed ancestor would otherwise
 * become the containing block for our position:fixed overlay, pinning
 * the dialog to the page container instead of the viewport.
 */
export default function Dialog({ open, onClose, title, icon: Icon, description, children, maxWidth = 560 }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-xl border bg-card shadow-lg"
        style={{ maxWidth, animation: 'cardIn .28s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="border-b px-5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold leading-none text-foreground">
              {Icon && <Icon className="h-4 w-4 text-primary" />}
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {description && (
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">{description}</p>
          )}
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4')}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
