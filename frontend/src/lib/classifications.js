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
    // The stored value stays UNACCEPTABLE — it is the playbook's own severity
    // vocabulary and changing it would orphan every rule and finding on record.
    // Only what a reviewer reads changes.
    label: 'Critical',
    short: 'Critical',
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

// ── Where the negotiation stands ─────────────────────────────────────────────
// Two axes, deliberately kept apart. A round's status is machine state; a
// negotiation's status is where the deal stands, and only two of its values are
// ever set by a human — because only two describe something the app cannot see.

export const NEGOTIATION_STATUS = {
  ai_in_progress: {
    label: 'AI in Progress',
    hint: 'The current round is being analysed.',
    manual: false,
  },
  ai_completed: {
    label: 'AI Completed',
    hint: 'Analysis finished. Nobody has worked the findings yet.',
    manual: false,
  },
  in_process: {
    label: 'In Process',
    hint: 'A reviewer is working through the redlines.',
    manual: false,
  },
  pending_vendor: {
    label: 'Pending Vendor',
    hint: 'Sent to the counterparty. Waiting on their response.',
    manual: true,
  },
  completed: {
    label: 'Completed',
    hint: 'Negotiation closed.',
    manual: true,
  },
  failed: { label: 'Failed', hint: 'The current round could not be processed.', manual: false },
}

// What the counterparty did to a position we put to them last round. Derived by
// diffing their returned file, so these are findings rather than guesses.
export const VENDOR_ACTION = {
  accepted: {
    label: 'Accepted',
    short: 'Accepted',
    hint: 'They took our proposed wording.',
    bg: 'var(--acceptable-bg)',
    fg: 'var(--acceptable-fg)',
  },
  countered: {
    label: 'Countered',
    short: 'Countered',
    hint: 'They proposed something else. Read what they wrote.',
    bg: 'var(--negotiable-bg)',
    fg: 'var(--negotiable-fg)',
  },
  rejected: {
    label: 'No change',
    short: 'No change',
    hint: 'They left the clause exactly as originally drafted.',
    bg: 'var(--unacceptable-bg)',
    fg: 'var(--unacceptable-fg)',
  },
  ignored: {
    label: 'No response',
    short: 'No response',
    hint: 'They did not add the clause we asked for.',
    bg: 'var(--missing-bg)',
    fg: 'var(--missing-fg)',
  },
  removed: {
    label: 'Clause deleted',
    short: 'Deleted',
    hint: 'They struck this clause from the document entirely.',
    bg: 'var(--missing-bg)',
    fg: 'var(--missing-fg)',
  },
  // Only accepted and reworded redlines go into the file the counterparty
  // receives, so a finding nobody ruled on never reached them. Calling that
  // "no movement" blames them for a question they were never asked.
  not_raised: {
    label: 'Not raised',
    short: 'Not raised',
    hint: 'This was not in the redline we sent, and the clause is unchanged.',
    bg: 'var(--muted)',
    fg: 'var(--muted-foreground)',
  },
  revised: {
    label: 'Revised unasked',
    short: 'Revised',
    hint: 'We did not raise this, but they rewrote the clause anyway — re-assessed against the playbook.',
    bg: 'var(--negotiable-bg)',
    fg: 'var(--negotiable-fg)',
  },
}

// Points the counterparty never actually saw. Sorted last and filterable, so a
// round reads as what moved rather than as the previous round repeated.
export const UNSENT_ACTIONS = ['not_raised']

export const ISSUE_STATUS = {
  open: { label: 'Open', settled: false },
  countered: { label: 'Countered', settled: false },
  agreed: { label: 'Agreed', settled: true },
  conceded: { label: 'Conceded', settled: true },
  dropped: { label: 'Dropped', settled: true },
}

export const isSettled = (issueStatus) => Boolean(ISSUE_STATUS[issueStatus]?.settled)

/** "12 days" since a timestamp, for the ageing column on the reviews list. */
export function daysSince(iso) {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - then.getTime()) / 86400000))
}

export function waitingLabel(iso) {
  const days = daysSince(iso)
  if (days === null) return null
  if (days === 0) return 'today'
  return `${days} day${days === 1 ? '' : 's'}`
}
