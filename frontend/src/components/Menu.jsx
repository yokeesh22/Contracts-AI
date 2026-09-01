import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'

/**
 * A labelled dropdown.
 *
 * Exists because the header ran out of room before it ran out of things to say,
 * and the first answer — turning the overflow into unlabelled icons — made the
 * rarest and most consequential actions the hardest to identify. A menu keeps
 * every action named; only the trigger has to fit.
 */
export default function Menu({ trigger, children, align = 'right', width = 240 }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-[calc(100%+4px)] z-30 overflow-hidden rounded-lg border bg-card py-1 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          style={{ width, animation: 'cardIn .16s cubic-bezier(.22,1,.36,1) both' }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * One named action in a menu. Never an icon on its own.
 *
 * `leading` reserves the same slot whether or not an item fills it. Items that
 * marked the current choice with a tick and left the others with nothing sat at
 * two different indents, which reads as a mistake rather than as a state.
 */
export function MenuItem({ icon: Icon, leading, label, hint, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? hint : undefined}
      className={cn(
        'flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-40'
          : danger
          ? 'text-destructive hover:bg-red-50'
          : 'hover:bg-secondary',
      )}
    >
      {(leading || Icon) && (
        <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center">
          {leading || <Icon className="h-3.5 w-3.5" />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-foreground">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
    </button>
  )
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-border" />
}
