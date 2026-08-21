import StatusBadge from './StatusBadge'
import { cn } from '../lib/utils'

const CLASSIFICATION_ORDER = ['CRITICAL_DEVIATION', 'ACCEPTABLE_DEVIATION', 'COMPLIANT', 'NOT_APPLICABLE']

const SUMMARY = [
  { key: 'COMPLIANT',            label: 'Compliant',            bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  { key: 'ACCEPTABLE_DEVIATION', label: 'Acceptable Deviation', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  { key: 'CRITICAL_DEVIATION',   label: 'Critical Deviation',   bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  { key: 'NOT_APPLICABLE',       label: 'Not Applicable',       bg: '#f7f8fa', color: '#475569', border: '#e2e6ed' },
]

export default function ExceptionTable({ requirements = [], onPageClick }) {
  const sorted = [...requirements].sort(
    (a, b) =>
      CLASSIFICATION_ORDER.indexOf(a.classification) -
      CLASSIFICATION_ORDER.indexOf(b.classification)
  )

  const counts = requirements.reduce((acc, r) => {
    acc[r.classification] = (acc[r.classification] || 0) + 1
    return acc
  }, {})

  // Only show the page column when the analysis captured page numbers
  // (PDF URS documents; DOCX has no page concept).
  const hasPages = requirements.some((r) => r.urs_page != null)

  return (
    <div className="space-y-3.5">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-2.5">
        {SUMMARY.map(({ key, label, bg, color, border }) => (
          <div
            key={key}
            className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium"
            style={{ background: bg, color, borderColor: border }}
          >
            <span className="font-mono-num text-base font-medium tabular-nums">{counts[key] || 0}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="relative w-full overflow-x-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <thead className="bg-muted [&_tr]:border-b">
            <tr>
              <th className="h-11 w-10 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground">#</th>
              <th className="h-11 w-28 min-w-[100px] px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground">Req. No.</th>
              {hasPages && (
                <th className="h-11 w-20 min-w-[72px] px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground">Page</th>
              )}
              <th className="h-11 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer Requirement</th>
              <th className="h-11 w-44 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground">Classification</th>
              <th className="h-11 w-64 min-w-[190px] px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spec Reference</th>
              <th className="h-11 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deviation / Exception Detail</th>
              <th className="h-11 w-48 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground">Remarks</th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {sorted.map((req, idx) => {
              const rowTint =
                req.classification === 'CRITICAL_DEVIATION'
                  ? '#fef2f2'
                  : req.classification === 'ACCEPTABLE_DEVIATION'
                  ? '#fff7ed'
                  : undefined
              return (
                <tr
                  key={req.id}
                  className={cn('border-b transition-colors', !rowTint && 'hover:bg-muted')}
                  style={rowTint ? { background: rowTint } : undefined}
                >
                  <td className="px-4 py-3 align-middle font-mono-num text-xs text-muted-foreground">{idx + 1}</td>
                  <td className="px-4 py-3 align-middle font-mono-num text-xs text-muted-foreground">{req.req_number || '—'}</td>
                  {hasPages && (
                    <td className="px-4 py-3 align-middle">
                      {req.urs_page != null ? (
                        onPageClick ? (
                          <button
                            type="button"
                            onClick={() => onPageClick(req.urs_page)}
                            title={`Open URS document at page ${req.urs_page}`}
                            className="font-mono-num rounded-md border bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground transition-colors hover:border-primary"
                          >
                            {req.urs_page}
                          </button>
                        ) : (
                          <span className="font-mono-num text-xs text-muted-foreground">{req.urs_page}</span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                  <td className="max-w-xs px-4 py-3 align-middle text-[13px] text-foreground">
                    <p className="line-clamp-3" title={req.req_text || undefined}>{req.req_text}</p>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <StatusBadge status={req.classification || 'NOT_APPLICABLE'} />
                  </td>
                  <td className="max-w-[240px] px-4 py-3 align-middle text-xs text-muted-foreground">
                    <p className="line-clamp-3" title={req.spec_reference || undefined}>{req.spec_reference || '—'}</p>
                  </td>
                  <td className="max-w-xs px-4 py-3 align-middle text-xs text-foreground">
                    <p className="line-clamp-4" title={req.deviation_detail || undefined}>{req.deviation_detail || '—'}</p>
                  </td>
                  <td className="px-4 py-3 align-middle text-xs text-muted-foreground">
                    <p className="line-clamp-3" title={req.remarks || undefined}>{req.remarks || '—'}</p>
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={hasPages ? 8 : 7} className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                  No requirements analyzed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
