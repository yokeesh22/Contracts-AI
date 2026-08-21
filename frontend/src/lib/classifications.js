/**
 * One source of truth for how a redline's assessment is labelled and coloured.
 *
 * Colours resolve to the CSS variables in index.css rather than literal hexes,
 * so the findings list, badges, summary chips and document pane all stay in
 * step with the rest of the design system.
 */

export const CLASSIFICATIONS = ['UNACCEPTABLE', 'MISSING', 'NEGOTIABLE', 'ACCEPTABLE']

export const CLASSIFICATION_META = {
  UNACCEPTABLE: {
    label: 'Unacceptable',
    short: 'Unacceptable',
    hint: 'Hits our walkaway position or shifts material risk to us.',
    bg: 'var(--unacceptable-bg)',
    fg: 'var(--unacceptable-fg)',
    border: 'var(--unacceptable-border)',
    dot: 'var(--unacceptable-dot)',
  },
  MISSING: {
    label: 'Missing Protection',
    short: 'Missing',
    hint: 'A required protection the contract does not contain at all.',
    bg: 'var(--missing-bg)',
    fg: 'var(--missing-fg)',
    border: 'var(--missing-border)',
    dot: 'var(--missing-dot)',
  },
  NEGOTIABLE: {
    label: 'Negotiable',
    short: 'Negotiable',
    hint: 'Falls short of our fallback, but a normal commercial ask.',
    bg: 'var(--negotiable-bg)',
    fg: 'var(--negotiable-fg)',
    border: 'var(--negotiable-border)',
    dot: 'var(--negotiable-dot)',
  },
  ACCEPTABLE: {
    label: 'Acceptable',
    short: 'Acceptable',
    hint: 'Meets our preferred or fallback position. No edit needed.',
    bg: 'var(--acceptable-bg)',
    fg: 'var(--acceptable-fg)',
    border: 'var(--acceptable-border)',
    dot: 'var(--acceptable-dot)',
  },
}

export const FALLBACK_META = {
  label: 'Unclassified',
  short: 'Unclassified',
  hint: '',
  bg: 'var(--muted)',
  fg: 'var(--muted-foreground)',
  border: 'var(--border)',
  dot: 'var(--muted-foreground)',
}

export const metaFor = (classification) =>
  CLASSIFICATION_META[classification] ?? FALLBACK_META

export const REDLINE_STATUS = {
  suggested: { label: 'Proposed', hint: 'Suggested by the analysis, not yet reviewed.' },
  accepted: { label: 'Accepted', hint: 'Will appear in the exported redline.' },
  rejected: { label: 'Rejected', hint: 'Clause left exactly as the vendor wrote it.' },
  modified: { label: 'Edited', hint: 'Reworded by a reviewer.' },
}

// Contract vocabulary is full of acronyms; title-casing them produces "Ai
// Training Data" and "Incorporation By Url", which reads as a bug to a lawyer.
const ACRONYMS = new Set(['AI', 'IP', 'URL', 'DPA', 'SLA', 'GAI', 'PI', 'US', 'EU'])
const LOWERCASE_WORDS = new Set(['by', 'of', 'on', 'to', 'for', 'and', 'the', 'in'])

/** "LIABILITY_CARVEOUTS" -> "Liability Carveouts"; "AI_TRAINING_DATA" -> "AI Training Data" */
export const humaniseClauseType = (value) =>
  (value || '')
    .split('_')
    .filter(Boolean)
    .map((word, i) => {
      if (ACRONYMS.has(word)) return word
      const lower = word.toLowerCase()
      if (i > 0 && LOWERCASE_WORDS.has(lower)) return lower
      return word.charAt(0) + lower.slice(1)
    })
    .join(' ')

/** Counts per classification, for the summary chips. */
export function countByClassification(redlines = []) {
  return redlines.reduce((acc, r) => {
    acc[r.classification] = (acc[r.classification] || 0) + 1
    return acc
  }, {})
}
