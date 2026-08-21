import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import PageLayout from '../components/PageLayout'
import Dialog from '../components/Dialog'
import {
  createRule,
  deleteRule,
  getPlaybook,
  getPlaybooks,
  updateRule,
} from '../services/api'
import { humaniseClauseType, metaFor } from '../lib/classifications'
import { cn } from '../lib/utils'

const SEVERITIES = ['UNACCEPTABLE', 'NEGOTIABLE', 'ACCEPTABLE']

const EMPTY_RULE = {
  clause_type: '',
  title: '',
  preferred_position: '',
  fallback_position: '',
  walkaway_position: '',
  standard_language: '',
  guidance: '',
  basis: '',
  severity: 'NEGOTIABLE',
  is_required: false,
  detection_hints: '',
}

/**
 * The playbook is the ground truth every review is judged against, so it lives
 * here as editable data rather than inside a prompt. A lawyer can see exactly
 * which position produced a finding and correct it without a code change.
 */
export default function PlaybookManager() {
  const [playbooks, setPlaybooks] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [playbook, setPlaybook] = useState(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    getPlaybooks().then((list) => {
      setPlaybooks(list)
      const preferred = list.find((p) => p.is_default) || list[0]
      setSelectedId(preferred?.id ?? null)
      if (!preferred) setLoading(false)
    })
  }, [])

  const reload = async (id = selectedId) => {
    if (!id) return
    setPlaybook(await getPlaybook(id))
    setLoading(false)
  }

  useEffect(() => {
    if (selectedId) reload(selectedId)
  }, [selectedId])

  const rules = useMemo(() => {
    const list = playbook?.rules || []
    if (!query.trim()) return list
    const needle = query.toLowerCase()
    return list.filter(
      (r) =>
        r.title.toLowerCase().includes(needle) ||
        r.clause_type.toLowerCase().includes(needle) ||
        (r.preferred_position || '').toLowerCase().includes(needle),
    )
  }, [playbook, query])

  const handleSave = async (values) => {
    if (editing?.id) {
      await updateRule(selectedId, editing.id, values)
    } else {
      await createRule(selectedId, { ...values, sort_order: (playbook?.rules?.length ?? 0) })
    }
    setEditing(null)
    await reload()
  }

  const handleDelete = async (rule) => {
    if (!window.confirm(`Delete the position "${rule.title}"?`)) return
    await deleteRule(selectedId, rule.id)
    await reload()
  }

  const requiredCount = (playbook?.rules || []).filter((r) => r.is_required).length

  return (
    <PageLayout
      title="Playbook"
      subtitle="The negotiating positions every contract is reviewed against"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Playbook' }]}
      actions={
        <button
          type="button"
          className="btn-primary"
          onClick={() => setEditing({ ...EMPTY_RULE })}
          disabled={!selectedId}
        >
          <Plus className="h-4 w-4" />
          Add position
        </button>
      }
    >
      {/* Provenance warning — these positions are inferred until legal confirms
          them, and the UI should never let that fact get lost. */}
      <div
        className="mb-4 flex items-start gap-2.5 rounded-lg border px-4 py-3 text-[13px]"
        style={{ background: '#fffbeb', color: '#92400e', borderColor: '#fde68a' }}
      >
        <Info className="mt-[2px] h-4 w-4 shrink-0" />
        <div>
          <span className="font-medium">These positions are inferred, not approved.</span>{' '}
          They were derived from the sample vendor agreements and encode market norms
          rather than confirmed policy. Each carries its evidence under &ldquo;Basis&rdquo;.
          Replace them as the business team confirms real positions.
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !playbook ? (
        <div className="card text-center text-[13px] text-muted-foreground">
          No playbook found.
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {playbooks.length > 1 && (
              <select
                className="input w-auto min-w-[240px]"
                value={selectedId || ''}
                onChange={(e) => setSelectedId(Number(e.target.value))}
              >
                {playbooks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input pl-8"
                placeholder="Search positions"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              {playbook.rules.length} positions
              <span aria-hidden>·</span>
              <span title="Flagged as MISSING when a contract omits them entirely">
                {requiredCount} required
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                open={expanded === rule.id}
                onToggle={() => setExpanded(expanded === rule.id ? null : rule.id)}
                onEdit={() => setEditing(rule)}
                onDelete={() => handleDelete(rule)}
              />
            ))}
            {!rules.length && (
              <div className="card text-center text-[13px] text-muted-foreground">
                No positions match &ldquo;{query}&rdquo;.
              </div>
            )}
          </div>
        </>
      )}

      <RuleDialog
        rule={editing}
        onClose={() => setEditing(null)}
        onSave={handleSave}
      />
    </PageLayout>
  )
}

function RuleRow({ rule, open, onToggle, onEdit, onDelete }) {
  const meta = metaFor(rule.severity)
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="mt-0.5 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <div className="min-w-0 flex-1 cursor-pointer" onClick={onToggle}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold text-foreground">{rule.title}</span>
            {rule.is_required && (
              <span
                className="rounded-full border px-2 py-0.5 text-[10.5px] font-medium"
                style={{
                  background: 'var(--missing-bg)',
                  color: 'var(--missing-fg)',
                  borderColor: 'var(--missing-border)',
                }}
                title="If a contract omits this entirely, the review raises a Missing Protection finding"
              >
                Required
              </span>
            )}
            {!rule.is_active && (
              <span className="rounded-full border px-2 py-0.5 text-[10.5px] text-muted-foreground">
                Inactive
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono-num text-[11.5px] text-muted-foreground">
            {humaniseClauseType(rule.clause_type)}
          </div>
        </div>

        <span
          className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium"
          style={{ background: meta.bg, color: meta.fg, borderColor: meta.border }}
          title="Assessment applied when a clause fails this position"
        >
          {meta.short}
        </span>

        <button
          type="button"
          onClick={onEdit}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Edit position"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-destructive"
          aria-label="Delete position"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="tab-panel-enter space-y-3 border-t px-4 py-3.5">
          <Field label="Preferred" value={rule.preferred_position} />
          <Field label="Fallback" value={rule.fallback_position} />
          <Field label="Walk away if" value={rule.walkaway_position} />
          <Field label="Standard language" value={rule.standard_language} mono />
          <Field label="Drafting guidance" value={rule.guidance} />
          <Field label="Basis" value={rule.basis} muted />
        </div>
      )}
    </div>
  )
}

function Field({ label, value, mono, muted }) {
  if (!value) return null
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <p
        className={cn(
          'whitespace-pre-wrap text-[12.5px] leading-relaxed',
          mono && 'font-mono-num rounded-md bg-secondary p-2.5',
          muted ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function RuleDialog({ rule, onClose, onSave }) {
  const [values, setValues] = useState(EMPTY_RULE)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (rule) setValues({ ...EMPTY_RULE, ...rule })
  }, [rule])

  const set = (key) => (e) =>
    setValues((prev) => ({
      ...prev,
      [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await onSave({
        ...values,
        clause_type: values.clause_type.trim().toUpperCase().replace(/\s+/g, '_'),
      })
    } catch (err) {
      window.alert(err?.response?.data?.detail || 'Could not save the position.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={Boolean(rule)}
      onClose={onClose}
      title={rule?.id ? 'Edit position' : 'Add position'}
      icon={BookOpen}
      maxWidth={700}
    >
      <form onSubmit={submit} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Title</label>
            <input className="input" value={values.title} onChange={set('title')} required />
          </div>
          <div>
            <label className="label">Clause type</label>
            <input
              className="input font-mono-num"
              value={values.clause_type}
              onChange={set('clause_type')}
              placeholder="LIABILITY_CAP"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Assessment when failed</label>
            <select className="input" value={values.severity} onChange={set('severity')}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {metaFor(s).label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer select-none items-end gap-2 pb-2 text-[13px] text-foreground">
            <input
              type="checkbox"
              checked={values.is_required}
              onChange={set('is_required')}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            <span title="Raises a Missing Protection finding when the contract omits it entirely">
              Required — flag when absent
            </span>
          </label>
        </div>

        <TextArea label="Preferred position" value={values.preferred_position} onChange={set('preferred_position')} required />
        <TextArea label="Fallback position" value={values.fallback_position} onChange={set('fallback_position')} />
        <TextArea label="Walk away if" value={values.walkaway_position} onChange={set('walkaway_position')} />
        <TextArea
          label="Standard language"
          value={values.standard_language}
          onChange={set('standard_language')}
          hint="The replacement wording proposed when a clause fails this position."
        />
        <TextArea label="Drafting guidance" value={values.guidance} onChange={set('guidance')} />
        <TextArea
          label="Basis"
          value={values.basis}
          onChange={set('basis')}
          hint="Where this position came from. Replace with 'Business team' once confirmed."
        />
        <TextArea
          label="Detection hints"
          value={values.detection_hints}
          onChange={set('detection_hints')}
          hint="Vocabulary a clause of this type actually uses, semicolon separated."
        />

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save position
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function TextArea({ label, value, onChange, hint, required }) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea
        className="input h-auto min-h-[74px] resize-y py-2 text-[12.5px] leading-relaxed"
        value={value || ''}
        onChange={onChange}
        required={required}
      />
      {hint && <p className="mt-1 text-[11.5px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
