import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * Data table matching the IDP `DataTable` component: bordered rounded
 * container, muted uppercase header, hoverable rows, and the same
 * pagination footer ("Showing X to Y of Z entries", rows-per-page
 * select, first/prev/next/last buttons). Plain-React reimplementation
 * of the tanstack-table version used in IDP.
 *
 * columns: [{ key, header, className, render(row, index) }]
 */
export default function DataTable({
  columns,
  data,
  onRowClick,
  rowClassName,
  renderExpanded,
  emptyMessage = 'No results found.',
  pageSizeOptions = [5, 10, 25, 50],
  initialPageSize = 10,
}) {
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(initialPageSize)

  const pageCount = Math.max(1, Math.ceil(data.length / pageSize))
  const safePage = Math.min(pageIndex, pageCount - 1)
  const pageRows = useMemo(
    () => data.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [data, safePage, pageSize],
  )

  return (
    <div className="flex flex-col">
      <div className="relative w-full overflow-x-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-10 bg-muted shadow-[inset_0_-1px_0_var(--border)] [&_tr]:border-b">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'h-11 whitespace-nowrap px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground',
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {pageRows.length ? (
              pageRows.map((row, i) => (
                <RowGroup key={row.id ?? i}>
                  <tr
                    className={cn(
                      'border-b transition-colors hover:bg-muted',
                      onRowClick && 'cursor-pointer',
                      rowClassName?.(row),
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn('px-4 py-3 align-middle', col.cellClassName)}
                      >
                        {col.render ? col.render(row, safePage * pageSize + i) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                  {renderExpanded?.(row)}
                </RowGroup>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="h-32 px-4 text-center text-[13px] text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {pageCount > 1 && (
          <div className="flex flex-col items-start justify-between gap-4 border-t bg-muted p-4 sm:flex-row sm:items-center">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="text-[13px] text-muted-foreground">
                Showing {safePage * pageSize + 1} to{' '}
                {Math.min((safePage + 1) * pageSize, data.length)} of{' '}
                <span className="font-medium text-foreground">{data.length}</span> entries
              </div>
              <div className="flex items-center gap-x-2">
                <p className="text-[13px] text-muted-foreground">Rows per page</p>
                <select
                  className="h-8 w-[70px] rounded-md border bg-card px-2 text-[13px] text-foreground outline-none focus:border-ring"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPageIndex(0)
                  }}
                >
                  {pageSizeOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-x-6">
              <div className="flex items-center gap-x-1 text-[13px] text-muted-foreground">
                <span>Page</span>
                <span className="font-medium text-foreground">{safePage + 1}</span>
                <span>of</span>
                <span className="font-medium text-foreground">{pageCount}</span>
              </div>

              <div className="flex items-center gap-x-1">
                <PageBtn onClick={() => setPageIndex(0)} disabled={safePage === 0} label="Go to first page">
                  <ChevronsLeft className="h-4 w-4" />
                </PageBtn>
                <PageBtn onClick={() => setPageIndex(safePage - 1)} disabled={safePage === 0} label="Go to previous page">
                  <ChevronLeft className="h-4 w-4" />
                </PageBtn>
                <PageBtn onClick={() => setPageIndex(safePage + 1)} disabled={safePage >= pageCount - 1} label="Go to next page">
                  <ChevronRight className="h-4 w-4" />
                </PageBtn>
                <PageBtn onClick={() => setPageIndex(pageCount - 1)} disabled={safePage >= pageCount - 1} label="Go to last page">
                  <ChevronsRight className="h-4 w-4" />
                </PageBtn>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Allows an optional expanded row (rendered by renderExpanded) to share
// the <tbody> without breaking the last-child border rule.
function RowGroup({ children }) {
  return children
}

function PageBtn({ children, onClick, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-md border bg-card text-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-50"
    >
      {children}
    </button>
  )
}
