import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, FileSignature, ShieldAlert, Activity,
  RefreshCw, ChevronRight, TrendingDown, ListChecks,
} from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import PageLayout from '../components/PageLayout'
import { getStats } from '../services/api'
import { CLASSIFICATIONS, metaFor } from '../lib/classifications'
import { cn } from '../lib/utils'

// The donut needs literal colours (conic-gradient cannot read a token through
// a JS string), so it mirrors the token values rather than replacing them.
const DONUT_COLORS = {
  UNACCEPTABLE: '#ef4444',
  MISSING: '#8b5cf6',
  NEGOTIABLE: '#f97316',
  ACCEPTABLE: '#22c55e',
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

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
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

  const donutSegments = CLASSIFICATIONS.map((key) => ({
    key,
    color: DONUT_COLORS[key],
    value: cls[key] ?? 0,
    label: metaFor(key).label,
  }))

  // How much of the AI's work reviewers actually keep — the most honest signal
  // of whether the playbook matches how this team really negotiates.
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
          label="Contracts Reviewed"
          value={stats?.completed_reviews ?? 0}
          sub={`${stats?.total_reviews ?? 0} uploaded in total`}
        />
        <KpiCard
          icon={Activity}
          iconBg="#fff7ed"
          iconColor="#c2410c"
          label="In Progress"
          value={(stats?.total_reviews ?? 0) - (stats?.completed_reviews ?? 0)}
          sub="reviews still running"
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

      <div className="stagger-children mb-4 grid grid-cols-1 gap-3.5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <div className="px-5 pt-4">
            <div className="card-title">Risk Profile</div>
            <div className="card-subtitle">All findings across reviewed contracts</div>
          </div>

          <div className="p-5 pt-4">
            {totalFindings === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <TrendingDown className="mb-2 h-10 w-10 opacity-40" />
                <p className="text-[13px]">No findings yet</p>
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <DonutChart segments={donutSegments} total={totalFindings} />
                <div className="min-w-0 flex-1 space-y-3">
                  {donutSegments.map(({ key, label, value, color }) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                          style={{ background: color }}
                        />
                        <span className="truncate text-[12.5px] text-muted-foreground">{label}</span>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <span className="font-mono-num text-[14px] tabular-nums text-foreground/85">
                          {value}
                        </span>
                        <span className="w-8 text-right text-xs text-muted-foreground/75">
                          {Math.round((value / totalFindings) * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

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
                        {r.total_clauses} findings ·{' '}
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
      </div>

      <div className="stagger-children grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <Card>
          <div className="px-5 pt-4">
            <div className="card-title">Review Activity</div>
            <div className="card-subtitle">How reviewers are handling suggestions</div>
          </div>
          <div className="p-5 pt-3">
            {[
              {
                label: 'Suggestions kept',
                value: keepRate == null ? '—' : `${keepRate}%`,
                title: 'Accepted or edited, as a share of everything reviewers decided on. A low rate means the playbook needs tuning.',
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
          </div>
        </Card>

        {[
          {
            label: 'Review a Contract',
            desc: 'Upload vendor paper and redline it',
            icon: FileSignature,
            path: '/reviews',
            bg: '#e8f2fc',
            color: '#016ac9',
          },
          {
            label: 'Tune the Playbook',
            desc: 'Edit the positions reviews are judged against',
            icon: ListChecks,
            path: '/playbook',
            bg: '#f5f3ff',
            color: '#6d28d9',
          },
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
