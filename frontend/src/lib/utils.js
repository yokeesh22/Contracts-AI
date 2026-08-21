/**
 * Join conditional class names. Mirrors the `cn` helper used across the
 * IDP frontend, minus the tailwind-merge conflict resolution (this app
 * doesn't ship clsx/tailwind-merge, and no call site relies on merging).
 */
export function cn(...inputs) {
  return inputs.flat(Infinity).filter(Boolean).join(' ')
}

/**
 * Bring an element into view, honouring the reader's motion preference.
 *
 * Jumping to a clause is functional navigation, not decoration, so it must not
 * depend on an animation running: smooth scrolling is skipped when the reader
 * asks for reduced motion, and in any embedded context that does not drive
 * animation frames the instant path still lands them on the right clause.
 */
export function scrollIntoView(node, block = 'center') {
  if (!node) return
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  node.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block })
}
