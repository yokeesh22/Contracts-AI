import { useEffect, useMemo, useRef } from 'react'
import { cn, scrollIntoView } from '../lib/utils'

/**
 * The contract, rendered from the block model the backend extracted.
 *
 * Three view modes rather than two tabs, matching what Word already trains
 * people on — and because Original and Redlined are the same document, so
 * switching between them should keep your place instead of resetting it:
 *
 *   original  — exactly as the vendor wrote it
 *   redlined  — strikethroughs and insertions, as the export will render them
 *   final     — every kept change applied, read clean
 *
 * Rendering our own blocks (rather than embedding a PDF or converting with
 * mammoth in the browser) is what makes clause-level scrolling possible and
 * keeps the on-screen redline identical to the exported one.
 */
export default function ContractViewer({
  blocks = [],
  redlines = [],
  mode = 'redlined',
  section,
  activeRedlineId,
  onSelectRedline,
  selectionEnabled = false,
  onSelectBlocks,
}) {
  const scrollRef = useRef(null)
  const blockRefs = useRef({})

  // Index redlines by the block they start at, so each block knows whether it
  // carries an edit without scanning the whole list per row.
  //
  // The engine groups overlapping findings into one edit per clause, so this is
  // normally 1:1. A reviewer can still add a redline over a clause that already
  // has one, and only one diff can render against a given paragraph — so the
  // selected redline wins, falling back to the first. Without this the
  // selected card would highlight nothing in the document.
  const editsByBlock = useMemo(() => {
    const map = new Map()
    for (const redline of redlines) {
      if (redline.block_start == null) continue
      const existing = map.get(redline.block_start)
      if (!existing || redline.id === activeRedlineId) {
        map.set(redline.block_start, redline)
      }
    }
    return map
  }, [redlines, activeRedlineId])

  // Blocks swallowed by a multi-block clause: the whole clause renders in the
  // first block, so the rest must not be drawn twice.
  const supersededBlocks = useMemo(() => {
    const set = new Set()
    for (const redline of redlines) {
      if (redline.block_start == null) continue
      const end = redline.block_end ?? redline.block_start
      for (let i = redline.block_start + 1; i <= end; i += 1) set.add(i)
    }
    return set
  }, [redlines])

  const visible = useMemo(
    () => blocks.filter((b) => !section || b.section === section),
    [blocks, section],
  )

  // Scroll the clause into view when a finding is selected on the right.
  useEffect(() => {
    if (!activeRedlineId) return
    const redline = redlines.find((r) => r.id === activeRedlineId)
    if (!redline || redline.block_start == null) return
    scrollIntoView(blockRefs.current[redline.block_start], 'center')
  }, [activeRedlineId, redlines])

  const handleMouseUp = () => {
    if (!selectionEnabled || !onSelectBlocks) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return

    const indices = []
    for (const block of visible) {
      const node = blockRefs.current[block.index]
      if (node && selection.containsNode(node, true)) indices.push(block.index)
    }
    if (indices.length) {
      onSelectBlocks({
        blockStart: Math.min(...indices),
        blockEnd: Math.max(...indices),
        text: selection.toString().trim(),
      })
    }
  }

  if (!blocks.length) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-[13px] text-muted-foreground">
        The document has not been extracted yet.
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto" onMouseUp={handleMouseUp}>
      <div className="doc-sheet">
        {visible.map((block) => {
          if (supersededBlocks.has(block.index)) return null
          const redline = editsByBlock.get(block.index)
          const isActive = redline && redline.id === activeRedlineId

          return (
            <div
              key={block.index}
              ref={(node) => {
                blockRefs.current[block.index] = node
              }}
              className={cn(
                'doc-block',
                block.kind === 'heading' && 'doc-block-heading',
                redline && 'doc-block-flagged',
                isActive && 'doc-block-active',
              )}
              onClick={() => redline && onSelectRedline?.(redline.id)}
              title={redline ? redline.clause_title || undefined : undefined}
            >
              <BlockBody block={block} redline={redline} mode={mode} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BlockBody({ block, redline, mode }) {
  // No edit here, or the reviewer rejected it — show the vendor's own words.
  if (!redline || mode === 'original' || redline.status === 'rejected') {
    return <span>{block.text}</span>
  }

  if (mode === 'final') {
    return <span>{redline.proposed_text || redline.original_text || block.text}</span>
  }

  if (!redline.diff?.length) return <span>{block.text}</span>

  return (
    <span>
      {redline.diff.map((op, i) => {
        if (op.op === 'equal') return <span key={i}>{op.text}</span>
        if (op.op === 'delete') {
          return (
            <span key={i} className="redline-del">
              {op.text}
            </span>
          )
        }
        return (
          <span key={i} className="redline-ins">
            {op.text}
          </span>
        )
      })}
    </span>
  )
}
