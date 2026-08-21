import { Link } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * The standard page shell, matching the IDP design system.
 *
 * 1300px max width, 28px horizontal padding, 28px top + 56px bottom padding,
 * breadcrumb with Home icon, 21px page title, 13px muted subtitle, optional
 * right-aligned actions.
 */
export default function PageLayout({
  title,
  subtitle,
  breadcrumbs,
  actions,
  children,
  className,
}) {
  return (
    <div className={cn('page-enter mx-auto max-w-[1300px] px-7 pb-14 pt-7', className)}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav
              aria-label="Breadcrumb"
              className="mb-1 flex items-center gap-1.5 text-xs leading-none text-muted-foreground"
            >
              {breadcrumbs.map((c, i) => {
                const last = i === breadcrumbs.length - 1
                const first = i === 0
                const labelNode = (
                  <span className="inline-flex items-center gap-1 leading-none">
                    {first && <Home className="h-3 w-3 shrink-0" />}
                    <span className={cn('leading-none', last && 'text-foreground')}>{c.label}</span>
                  </span>
                )
                return (
                  <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1.5 leading-none">
                    {!first && <ChevronRight className="h-3 w-3 shrink-0 opacity-45" />}
                    {c.to && !last ? (
                      <Link to={c.to} className="inline-flex items-center leading-none hover:text-foreground">
                        {labelNode}
                      </Link>
                    ) : (
                      labelNode
                    )}
                  </span>
                )
              })}
            </nav>
          )}
          <h1 className="text-[21px] font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
