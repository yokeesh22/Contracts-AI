import { UNSENT_ACTIONS, isCritical } from './classifications'

export const SEVERITY_ORDER = {
  UNACCEPTABLE: 0,
  MISSING: 1,
  NEGOTIABLE: 2,
  ACCEPTABLE: 3,
}

/**
 * Severity, as it is asked about in each round.
 *
 * Round one is triage, so all four severities earn a chip. From round two the
 * list is read for what moved and severity becomes the tiebreak, so it collapses
 * to the one question that still changes what you do next.
 */
export const SEVERITY_FILTERS = {
  triage: [
    { key: 'UNACCEPTABLE', test: (r) => r.classification === 'UNACCEPTABLE' },
    { key: 'MISSING', test: (r) => r.classification === 'MISSING' },
    { key: 'NEGOTIABLE', test: (r) => r.classification === 'NEGOTIABLE' },
    { key: 'ACCEPTABLE', test: (r) => r.classification === 'ACCEPTABLE' },
  ],
  rounds: [
    { key: 'critical', label: 'Critical', test: (r) => isCritical(r.classification) },
    { key: 'non_critical', label: 'Non-critical', test: (r) => !isCritical(r.classification) },
  ],
}

export const isUnsent = (redline) => UNSENT_ACTIONS.includes(redline.vendor_action)

/** True once any finding carries a comparison against a previous round. */
export const hasResponses = (redlines) =>
  redlines.some((r) => r.vendor_action || r.is_vendor_introduced)

export const countBy = (redlines, filters) =>
  Object.fromEntries(filters.map((f) => [f.key, redlines.filter(f.test).length]))

/**
 * Apply the one active filter, then order worst-first.
 *
 * Ignored points are separated out rather than filtered away: the caller shows
 * them behind a count, so a decision to let something go stays visible without
 * twenty of them burying the three clauses that actually changed.
 */
export function partition(redlines, { severity, showIgnored }) {
  const live = []
  const ignored = []
  for (const redline of redlines) {
    ;(isUnsent(redline) ? ignored : live).push(redline)
  }

  const match = (list) => {
    if (!severity) return list
    const all = [...SEVERITY_FILTERS.triage, ...SEVERITY_FILTERS.rounds]
    const active = all.find((f) => f.key === severity)
    return active ? list.filter(active.test) : list
  }

  const order = (list) =>
    [...list].sort(
      (a, b) =>
        (SEVERITY_ORDER[a.classification] ?? 9) - (SEVERITY_ORDER[b.classification] ?? 9) ||
        a.sort_order - b.sort_order,
    )

  return {
    visible: order(match(live)),
    ignored: order(match(ignored)),
    ignoredCount: ignored.length,
    showIgnored,
  }
}
