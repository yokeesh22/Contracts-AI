import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, BarChart2, CheckCircle2, Activity,
  RefreshCw, ChevronRight, TrendingDown,
} from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import PageLayout from '../components/PageLayout'
import { getStats } from '../services/api'
import { cn } from '../lib/utils'

// ── Card shell (mirrors the IDP dashboard card) ──────────────────────────────
function Card({ children, className }) {
  return (
    <div
      className={cn('hover-lift overflow-hidden rounded-[13px] border bg-card', className)}
      style={{ boxShadow: '0 1px 3px rgba(14,21,32,0.07)' }}
    >
      {children}
    </div>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, iconBg, iconColor, label, value, sub }) {
  return (
    <Card>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[10px]"
            style={{ background: iconBg, color: iconColor }}
          >
            <Icon className="h-[18px] w-[18px]" />
          </div>
        </div>
        <div>
          <div className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 text-[26px] font-semibold leading-none tracking-tight text-foreground">
            {value}
          </div>
          {sub && <div className="mt-2 text-xs text-muted-foreground">{sub}</div>}
        </div>
      </div>
    </Card>
  )
}

// ── Donut chart (pure CSS conic-gradient) ────────────────────────────────────
function DonutChart({ segments, total }) {
  if (total === 0) {
    return (
      <div className="relative flex h-36 w-36 items-center justify-center">
        <div className="h-36 w-36 rounded-full bg-muted" />
        <div className="absolute flex h-20 w-20 flex-col items-center justify-center rounded-full bg-card">
          <span className="text-xl font-semibold text-muted-foreground">0</span>
          <span className="text-xs text-muted-foreground">Total</span>
        </div>
      </div>
    )
  }

  let cumulativePct = 0
  const stops = segments
    .map(({ color, value }) => {
      const pct = (value / total) * 100
      const start = cumulativePct
      cumulativePct += pct
      return `${color} ${start.toFixed(1)}% ${cumulativePct.toFixed(1)}%`
    })
    .join(', ')

  return (
    <div className="relative flex h-36 w-36 flex-shrink-0 items-center justify-center">
      <div className="h-36 w-36 rounded-full" style={{ background: `conic-gradient(${stops})` }} />
      <div className="absolute flex h-[84px] w-[84px] flex-col items-center justify-center rounded-full bg-card shadow-sm">
        <span className="text-2xl font-semibold tracking-tight text-foreground">{total}</span>
        <span className="text-xs text-muted-foreground">Total</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))

    const iv = setInterval(() => getStats().then(setStats).catch(() => {}), 15000)
    return () => clearInterval(iv)
  }, [])

  const cls = stats?.classifications ?? {}
  const totalCls = Object.values(cls).reduce((a, b) => a + b, 0)

  const donutSegments = [
    { color: '#22c55e', value: cls.COMPLIANT ?? 0,            label: 'Compliant',            dot: '#22c55e' },
    { color: '#f97316', value: cls.ACCEPTABLE_DEVIATION ?? 0, label: 'Acceptable Deviation', dot: '#f97316' },
    { color: '#ef4444', value: cls.CRITICAL_DEVIATION ?? 0,   label: 'Critical Deviation',   dot: '#ef4444' },
    { color: '#cbd5e1', value: cls.NOT_APPLICABLE ?? 0,       label: 'Not Applicable',       dot: '#cbd5e1' },
  ]

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <PageLayout
      title="Dashboard"
      subtitle="Review key metrics and recent analysis activity across your organization."
      breadcrumbs={[{ label: 'Home' }, { label: 'Dashboard' }]}
      actions={
        <button onClick={() => getStats().then(setStats).catch(() => {})} className="btn-secondary">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      }
    >
      {/* KPI cards */}
      <div className="stagger-children mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={FileText}
          iconBg="#e8f2fc"
          iconColor="#016ac9"
          label="Specifications"
          value={stats?.total_specifications ?? 0}
          sub={`${stats?.completed_specifications ?? 0} extracted`}
        />
        <KpiCard
          icon={Activity}
          iconBg="#fff7ed"
          iconColor="#c2410c"
          label="Awaiting / Running"
          value={(stats?.total_analyses ?? 0) - (stats?.completed_analyses ?? 0)}
          sub={`${stats?.total_analyses ?? 0} total sessions`}
        />
        <KpiCard
          icon={CheckCircle2}
          iconBg="#f0fdf4"
          iconColor="#15803d"
          label="Approval Rate"
          value={totalCls > 0 ? `${Math.round(((cls.COMPLIANT ?? 0) / totalCls) * 100)}%` : '—'}
          sub={`${cls.COMPLIANT ?? 0} compliant · ${cls.CRITICAL_DEVIATION ?? 0} critical`}
        />
        <KpiCard
          icon={BarChart2}
          iconBg="#f5f3ff"
          iconColor="#6d28d9"
          label="Requirements Analyzed"
          value={stats?.total_requirements ?? 0}
          sub={`across ${stats?.completed_analyses ?? 0} completed sessions`}
        />
      </div>

      {/* Middle row: classification + recent sessions */}
      <div className="stagger-children mb-4 grid grid-cols-1 gap-3.5 lg:grid-cols-5">
        {/* Status distribution */}
        <Card className="lg:col-span-2">
          <div className="px-5 pt-4">
            <div className="card-title">Status Distribution</div>
            <div className="card-subtitle">Current breakdown across all requirements</div>
          </div>

          <div className="p-5 pt-4">
            {totalCls === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <TrendingDown className="mb-2 h-10 w-10 opacity-40" />
                <p className="text-[13px]">No data yet</p>
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <DonutChart segments={donutSegments} total={totalCls} />
                <div className="min-w-0 flex-1 space-y-3">
                  {donutSegments.map(({ label, value, dot }) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                          style={{ background: dot }}
                        />
                        <span className="truncate text-[12.5px] text-muted-foreground">{label}</span>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <span className="font-mono-num text-[14px] tabular-nums text-foreground/85">{value}</span>
                        <span className="w-8 text-right text-xs text-muted-foreground/75">
                          {totalCls > 0 ? `${Math.round((value / totalCls) * 100)}%` : '0%'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Recent activity */}
        <Card className="lg:col-span-3">
          <div className="flex items-start justify-between px-5 pt-4">
            <div>
              <div className="card-title">Recent Activity</div>
              <div className="card-subtitle">Latest analysis sessions</div>
            </div>
            <button
              onClick={() => navigate('/analysis')}
              className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary-hover"
            >
              View all <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          <div className="p-3 pt-3">
            {!stats?.recent_sessions?.length ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <BarChart2 className="mb-2 h-10 w-10 opacity-40" />
                <p className="text-[13px]">No sessions yet</p>
                <button
                  onClick={() => navigate('/analysis')}
                  className="mt-3 text-xs font-medium text-primary hover:text-primary-hover"
                >
                  Start your first analysis →
                </button>
              </div>
            ) : (
              <div className="space-y-0.5">
                {stats.recent_sessions.map((s, i) => (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/analysis/${s.id}`)}
                    className="group flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2.5 transition-colors hover:bg-muted"
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-accent">
                      <span className="font-mono-num text-xs font-medium text-accent-foreground">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">{s.urs_name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {s.analyzed_count}/{s.total_requirements} requirements ·{' '}
                        {new Date(s.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <StatusBadge status={s.status} />
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Processing health / quick-actions row */}
      <div className="stagger-children grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <Card>
          <div className="px-5 pt-4">
            <div className="card-title">Processing Health</div>
          </div>
          <div className="p-5 pt-3">
            {[
              { label: 'Spec. extraction rate', value: stats?.completed_specifications > 0 ? `${Math.round((stats.completed_specifications / stats.total_specifications) * 100)}%` : '—' },
              { label: 'Analysis completion rate', value: stats?.completed_analyses > 0 ? `${Math.round((stats.completed_analyses / stats.total_analyses) * 100)}%` : '—' },
              { label: 'Total sessions', value: stats?.total_analyses ?? 0 },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex items-center justify-between border-b py-2.5 last:border-0"
              >
                <span className="text-[12.5px] text-muted-foreground">{label}</span>
                <span className="font-mono-num text-[14px] tabular-nums text-foreground/85">{value}</span>
              </div>
            ))}
          </div>
        </Card>

        {[
          { label: 'Upload Specification', desc: 'Add a new technical document', icon: FileText,  path: '/specifications', bg: '#e8f2fc', color: '#016ac9' },
          { label: 'Run Analysis',         desc: 'Compare URS against a spec',   icon: BarChart2, path: '/analysis',       bg: '#f5f3ff', color: '#6d28d9' },
        ].map((a) => (
          <Card key={a.path}>
            <button onClick={() => navigate(a.path)} className="w-full p-4 text-left">
              <div
                className="mb-4 flex h-9 w-9 items-center justify-center rounded-[10px]"
                style={{ background: a.bg, color: a.color }}
              >
                <a.icon className="h-[18px] w-[18px]" />
              </div>
              <p className="text-[13.5px] font-semibold text-foreground">{a.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{a.desc}</p>
              <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
                Get started <ChevronRight className="h-3 w-3" />
              </div>
            </button>
          </Card>
        ))}
      </div>
    </PageLayout>
  )
}
