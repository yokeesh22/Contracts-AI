import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, FileSignature, ShieldAlert, Activity,
  RefreshCw, ChevronRight, TrendingDown, ListChecks,
} from 'lucide-react'
import {
  Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import StatusBadge from '../components/StatusBadge'
import PageLayout from '../components/PageLayout'
import { getStats } from '../services/api'
import { CLASSIFICATIONS, metaFor } from '../lib/classifications'
import { cn } from '../lib/utils'

// Recharts renders into SVG attributes, which cannot read a CSS custom
// property through a JS string — so the chart palette mirrors the token values
// rather than replacing them. Keep in step with index.css.
const CLASSIFICATION_COLORS = {
  UNACCEPTABLE: { from: '#f05252', to: '#dc2626' },
  MISSING: { from: '#a78bfa', to: '#7c3aed' },
  NEGOTIABLE: { from: '#fb923c', to: '#ea580c' },
  ACCEPTABLE: { from: '#4ade80', to: '#16a34a' },
}

const RANGE_DAYS = { '7d': 7, '14d': 14, '30d': 30 }

const TOOLTIP_STYLE = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 12,
  boxShadow: '0 4px 16px rgba(14,21,32,0.08)',
}

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

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('30d')
  const navigate = useNavigate()

  const refresh = () => getStats().then(setStats).catch(() => {})

  useEffect(() => {
    refresh().finally(() => setLoading(false))
    const iv = setInterval(refresh, 15000)
    return () => clearInterval(iv)
  }, [])

  const cls = stats?.classifications ?? {}
  const totalFindings = Object.values(cls).reduce((a, b) => a + b, 0)
  const highRisk = (cls.UNACCEPTABLE ?? 0) + (cls.MISSING ?? 0)

  const pieData = useMemo(
    () =>
      CLASSIFICATIONS.map((key) => ({
        key,
        name: metaFor(key).label,
        value: cls[key] ?? 0,
      })).filter((d) => d.value > 0),
    [cls],
  )

  // The backend always returns 30 days; the range buttons slice the tail so
  // switching ranges costs no round trip.
  const series = useMemo(() => {
    const all = stats?.activity_series ?? []
    return all.slice(-RANGE_DAYS[range])
  }, [stats, range])

  const rs = stats?.redline_status ?? {}
  const decided = (rs.accepted ?? 0) + (rs.rejected ?? 0) + (rs.modified ?? 0)
  const keepRate = decided > 0
    ? Math.round((((rs.accepted ?? 0) + (rs.modified ?? 0)) / decided) * 100)
    : null

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
      subtitle="Contract review activity and the risk profile of what has been reviewed."
      breadcrumbs={[{ label: 'Home' }, { label: 'Dashboard' }]}
      actions={
        <button onClick={refresh} className="btn-secondary">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      }
    >
      <div className="stagger-children mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={FileSignature}
          iconBg="#e8f2fc"
          iconColor="#016ac9"
          label="Negotiations Closed"
          value={stats?.completed_reviews ?? 0}
          sub={`${stats?.total_reviews ?? 0} contracts · ${stats?.total_rounds ?? 0} rounds exchanged`}
        />
        <KpiCard
          icon={Activity}
          iconBg="#fff7ed"
          iconColor="#c2410c"
          label="Pending Vendor"
          value={stats?.pending_vendor ?? 0}
          sub={
            stats?.longest_wait_days
              ? `longest wait ${stats.longest_wait_days} day${stats.longest_wait_days === 1 ? '' : 's'}`
              : `${(stats?.total_reviews ?? 0) - (stats?.completed_reviews ?? 0)} negotiations live`
          }
        />
        <KpiCard
          icon={ShieldAlert}
          iconBg="#fef2f2"
          iconColor="#b91c1c"
          label="High-Risk Findings"
          value={highRisk}
          sub={`${cls.UNACCEPTABLE ?? 0} unacceptable · ${cls.MISSING ?? 0} missing`}
        />
        <KpiCard
          icon={BookOpen}
          iconBg="#f5f3ff"
          iconColor="#6d28d9"
          label="Playbook Positions"
          value={stats?.total_rules ?? 0}
          sub={`across ${stats?.total_playbooks ?? 0} playbook(s)`}
        />
      </div>

      {/* Charts row */}
      <div className="stagger-children mb-4 grid grid-cols-1 gap-3.5 lg:grid-cols-5">
        {/* Review activity over time */}
        <Card className="lg:col-span-3">
          <div className="flex items-start justify-between px-5 pt-4">
            <div>
              <div className="card-title">Review Activity</div>
              <div className="card-subtitle">
                Findings raised over the last {RANGE_DAYS[range]} days
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-md border bg-secondary p-0.5">
              {Object.keys(RANGE_DAYS).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRange(key)}
                  className={cn(
                    'rounded px-2 py-0.5 text-[11.5px] font-medium transition-colors',
                    range === key
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[288px] px-2 pb-3 pt-4">
            {!series.some((d) => d.findings > 0) ? (
              <EmptyChart label="No findings in this period" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 14, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="findingsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#016ac9" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#016ac9" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.26} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={30}
                  />
                  <Tooltip
                    cursor={{ stroke: '#016ac9', strokeWidth: 1, strokeOpacity: 0.3 }}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: '#64748b', fontWeight: 500 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="findings"
                    name="All findings"
                    stroke="#016ac9"
                    strokeWidth={2}
                    fill="url(#findingsFill)"
                  />
                  <Area
                    type="monotone"
                    dataKey="high_risk"
                    name="High risk"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fill="url(#riskFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Risk profile donut */}
        <Card className="lg:col-span-2">
          <div className="px-5 pt-4">
            <div className="card-title">Risk Profile</div>
            <div className="card-subtitle">All findings across reviewed contracts</div>
          </div>
          <div className="flex items-center gap-3 px-3 pb-4 pt-2">
            <div className="relative h-[180px] w-[180px] flex-shrink-0">
              {pieData.length === 0 ? (
                <div className="flex h-full w-full items-center justify-center rounded-full border-2 border-dashed border-border text-xs text-muted-foreground">
                  No data
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <defs>
                        {Object.entries(CLASSIFICATION_COLORS).map(([key, g]) => (
                          <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={g.from} />
                            <stop offset="100%" stopColor={g.to} />
                          </linearGradient>
                        ))}
                      </defs>
                      <Pie
                        data={pieData}
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="#ffffff"
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.key} fill={`url(#grad-${entry.key})`} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-[22px] font-semibold leading-none text-foreground">
                      {totalFindings}
                    </div>
                    <div className="mt-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                      findings
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {pieData.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Review a contract to see the breakdown
                </span>
              ) : (
                CLASSIFICATIONS.map((key) => {
                  const value = cls[key] ?? 0
                  return (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                          style={{ background: CLASSIFICATION_COLORS[key].to }}
                        />
                        <span className="truncate text-[12px] text-muted-foreground">
                          {metaFor(key).short}
                        </span>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <span className="font-mono-num text-[13px] tabular-nums text-foreground/85">
                          {value}
                        </span>
                        <span className="w-8 text-right text-[11px] text-muted-foreground/75">
                          {totalFindings ? `${Math.round((value / totalFindings) * 100)}%` : '0%'}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Recent + activity */}
      <div className="stagger-children grid grid-cols-1 gap-3.5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="flex items-start justify-between px-5 pt-4">
            <div>
              <div className="card-title">Recent Reviews</div>
              <div className="card-subtitle">Latest contracts put through the playbook</div>
            </div>
            <button
              onClick={() => navigate('/reviews')}
              className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary-hover"
            >
              View all <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          <div className="p-3 pt-3">
            {!stats?.recent_reviews?.length ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <FileSignature className="mb-2 h-10 w-10 opacity-40" />
                <p className="text-[13px]">No contracts reviewed yet</p>
                <button
                  onClick={() => navigate('/reviews')}
                  className="mt-3 text-xs font-medium text-primary hover:text-primary-hover"
                >
                  Review your first contract →
                </button>
              </div>
            ) : (
              <div className="space-y-0.5">
                {stats.recent_reviews.map((r, i) => (
                  <div
                    key={r.id}
                    onClick={() => navigate(`/reviews/${r.id}`)}
                    className="group flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2.5 transition-colors hover:bg-muted"
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-accent">
                      <span className="font-mono-num text-xs font-medium text-accent-foreground">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">{r.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {r.counterparty ? `${r.counterparty} · ` : ''}
                        R{r.current_round} · {r.open_issues} open ·{' '}
                        {new Date(r.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="px-5 pt-4">
            <div className="card-title">Reviewer Decisions</div>
            <div className="card-subtitle">How suggestions are being handled</div>
          </div>
          <div className="p-5 pt-3">
            {[
              {
                label: 'Suggestions kept',
                value: keepRate == null ? '—' : `${keepRate}%`,
                title:
                  'Accepted or edited, as a share of everything reviewers decided on. A low rate means the playbook needs tuning.',
              },
              { label: 'Awaiting review', value: rs.suggested ?? 0 },
              { label: 'Rejected', value: rs.rejected ?? 0 },
              { label: 'Total findings', value: stats?.total_redlines ?? 0 },
            ].map(({ label, value, title }) => (
              <div
                key={label}
                className="flex items-center justify-between border-b py-2.5 last:border-0"
                title={title}
              >
                <span className="text-[12.5px] text-muted-foreground">{label}</span>
                <span className="font-mono-num text-[14px] tabular-nums text-foreground/85">
                  {value}
                </span>
              </div>
            ))}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => navigate('/reviews')}
                className="btn-primary h-8 flex-1 px-3 text-[12.5px]"
              >
                <FileSignature className="h-3.5 w-3.5" />
                Review a contract
              </button>
              <button
                onClick={() => navigate('/playbook')}
                className="btn-secondary h-8 flex-1 px-3 text-[12.5px]"
              >
                <ListChecks className="h-3.5 w-3.5" />
                Playbook
              </button>
            </div>
          </div>
        </Card>
      </div>
    </PageLayout>
  )
}

function EmptyChart({ label }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
      <TrendingDown className="mb-2 h-10 w-10 opacity-40" />
      <p className="text-[13px]">{label}</p>
    </div>
  )
}
