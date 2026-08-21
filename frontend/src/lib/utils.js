/**
 * Join conditional class names. Mirrors the `cn` helper used across the
 * IDP frontend, minus the tailwind-merge conflict resolution (this app
 * doesn't ship clsx/tailwind-merge, and no call site relies on merging).
 */
export function cn(...inputs) {
  return inputs.flat(Infinity).filter(Boolean).join(' ')
}
