import { useEffect, useState, useCallback } from 'react'
import {
  UserPlus, Pencil, Trash2, RefreshCw, ShieldCheck,
  User, Eye, EyeOff, Check, X, KeyRound,
} from 'lucide-react'
import { getUsers, createUser, updateUser, deleteUser, changePassword } from '../services/api'
import { useAuth } from '../context/AuthContext'
import PageLayout from '../components/PageLayout'
import Dialog from '../components/Dialog'
import { cn } from '../lib/utils'

const ROLES = ['Administrator', 'Analyst', 'Viewer']

const ROLE_BADGE = {
  Administrator: { bg: '#e8f2fc', color: '#016ac9', border: '#bfdbfe' },
  Analyst:       { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
  Viewer:        { bg: '#f7f8fa', color: '#475569', border: '#e2e6ed' },
}

const SUMMARY_CHIPS = [
  { key: 'total',  label: 'Total',          bg: '#e8f2fc', color: '#016ac9', border: '#bfdbfe' },
  { key: 'active', label: 'Active',         bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  { key: 'admins', label: 'Administrators', bg: '#e8f2fc', color: '#016ac9', border: '#bfdbfe' },
  { key: 'analysts', label: 'Analysts',     bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
]

// ── Modal wrapper (shared portal-based dialog) ────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <Dialog open onClose={onClose} title={title} maxWidth={448}>
      {children}
    </Dialog>
  )
}

// ── Create / Edit user form ───────────────────────────────────────────────────
function UserForm({ initial, onSave, onClose, loading, error }) {
  const [name, setName] = useState(initial?.name || '')
  const [email, setEmail] = useState(initial?.email || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(initial?.role || 'Analyst')
  const [showPw, setShowPw] = useState(false)
  const isEdit = !!initial

  const handleSubmit = (e) => {
    e.preventDefault()
    const data = { name, role }
    if (!isEdit) { data.email = email; data.password = password }
    onSave(data)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Full Name *</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith" required disabled={loading} />
      </div>
      {!isEdit && (
        <>
          <div>
            <label className="label">Work Email *</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@steris.com" required disabled={loading} />
          </div>
          <div>
            <label className="label">Password *</label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                required
                minLength={6}
                disabled={loading}
              />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </>
      )}
      <div>
        <label className="label">Role *</label>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value)} disabled={loading}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {error && (
        <p
          className="rounded-md border px-3 py-2 text-[13px]"
          style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
        >
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {isEdit ? 'Save Changes' : 'Create User'}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
      </div>
    </form>
  )
}

// ── Change password form ──────────────────────────────────────────────────────
function ChangePasswordForm({ userId, onClose }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [showCur, setShowCur] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await changePassword(userId, current, next)
      setDone(true)
      setTimeout(onClose, 1200)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to change password.')
    } finally {
      setLoading(false)
    }
  }

  if (done) return (
    <div className="flex flex-col items-center gap-3 py-4" style={{ color: '#15803d' }}>
      <Check className="h-8 w-8" />
      <p className="text-[13.5px] font-medium">Password updated successfully!</p>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {[
        { label: 'Current Password', val: current, set: setCurrent, show: showCur, toggle: () => setShowCur(v => !v) },
        { label: 'New Password',     val: next,    set: setNext,    show: showNext, toggle: () => setShowNext(v => !v) },
      ].map(({ label, val, set, show, toggle }) => (
        <div key={label}>
          <label className="label">{label}</label>
          <div className="relative">
            <input className="input pr-10" type={show ? 'text' : 'password'} value={val} onChange={(e) => set(e.target.value)} required minLength={6} disabled={loading} />
            <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      ))}
      {error && (
        <p
          className="rounded-md border px-3 py-2 text-[13px]"
          style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
        >
          {error}
        </p>
      )}
      <div className="flex gap-3 pt-1">
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          Update Password
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UserManagement() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'create' | { edit: user } | { pw: user }
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    try { setUsers(await getUsers()) } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const closeModal = () => { setModal(null); setFormError('') }

  const handleCreate = async (data) => {
    setSaving(true); setFormError('')
    try {
      await createUser(data)
      await load()
      closeModal()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to create user.')
    } finally { setSaving(false) }
  }

  const handleEdit = async (data) => {
    setSaving(true); setFormError('')
    try {
      await updateUser(modal.edit.id, data)
      await load()
      closeModal()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to update user.')
    } finally { setSaving(false) }
  }

  const handleToggleActive = async (u) => {
    try {
      await updateUser(u.id, { is_active: !u.is_active })
      await load()
    } catch { alert('Failed to update user status.') }
  }

  const handleDelete = async (u) => {
    if (!confirm(`Delete user "${u.name}"? This cannot be undone.`)) return
    try { await deleteUser(u.id); await load() }
    catch { alert('Failed to delete user.') }
  }

  const isAdmin = currentUser?.role === 'Administrator'

  return (
    <PageLayout
      title="User Management"
      subtitle="Manage who can access the Deviation Analyzer portal."
      breadcrumbs={[{ label: 'Home' }, { label: 'User Management' }]}
      className="max-w-[1000px]"
      actions={
        isAdmin && (
          <button className="btn-primary" onClick={() => setModal('create')}>
            <UserPlus className="h-4 w-4" /> Add User
          </button>
        )
      }
    >
      <div className="space-y-3.5">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-2.5">
        {SUMMARY_CHIPS.map(({ key, label, bg, color, border }) => {
          const count =
            key === 'total' ? users.length
            : key === 'active' ? users.filter((u) => u.is_active).length
            : key === 'admins' ? users.filter((u) => u.role === 'Administrator').length
            : users.filter((u) => u.role === 'Analyst').length
          return (
            <div
              key={key}
              className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium"
              style={{ background: bg, color, borderColor: border }}
            >
              <span className="font-mono-num text-base font-medium tabular-nums">{count}</span>
              {label}
            </div>
          )
        })}
      </div>

      {/* Users table */}
      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-lg border bg-card shadow-card">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-card">
          <div className="grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-4 border-b bg-muted px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>User</span>
            <span>Email</span>
            <span>Role</span>
            <span>Status</span>
            <span className="w-28 text-right">Actions</span>
          </div>

          <div>
            {users.map((u) => {
              const role = ROLE_BADGE[u.role] || ROLE_BADGE.Viewer
              const status = u.is_active
                ? { label: 'Active', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' }
                : { label: 'Inactive', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' }
              return (
                <div
                  key={u.id}
                  className="grid grid-cols-[2fr_2fr_1fr_1fr_auto] items-center gap-4 border-b px-5 py-4 transition-colors last:border-0 hover:bg-muted"
                >
                  {/* Name */}
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] text-xs font-semibold"
                      style={
                        u.is_active
                          ? { background: '#eff6ff', borderColor: '#bfdbfe', color: '#016ac9' }
                          : { background: '#f7f8fa', borderColor: '#e2e6ed', color: '#94a3b8' }
                      }
                    >
                      {u.name[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground">{u.name}</p>
                      {u.id === currentUser?.id && (
                        <span className="text-xs font-medium text-primary">You</span>
                      )}
                    </div>
                  </div>

                  {/* Email */}
                  <p className="truncate text-[13px] text-muted-foreground">{u.email}</p>

                  {/* Role */}
                  <span
                    className="inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium"
                    style={{ background: role.bg, color: role.color, borderColor: role.border }}
                  >
                    <ShieldCheck className="h-3 w-3" />
                    {u.role}
                  </span>

                  {/* Status */}
                  <span
                    className="inline-flex w-fit items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium"
                    style={{ background: status.bg, color: status.color, borderColor: status.border }}
                  >
                    {status.label}
                  </span>

                  {/* Actions */}
                  {isAdmin ? (
                    <div className="flex w-28 items-center justify-end gap-1">
                      <button
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                        title="Edit user"
                        onClick={() => { setModal({ edit: u }); setFormError('') }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                        title="Change password"
                        onClick={() => setModal({ pw: u })}
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        className={cn(
                          'rounded-md p-1.5 text-muted-foreground transition-colors',
                          u.is_active
                            ? 'hover:bg-orange-50 hover:text-orange-600'
                            : 'hover:bg-green-50 hover:text-green-700',
                        )}
                        title={u.is_active ? 'Deactivate' : 'Activate'}
                        onClick={() => handleToggleActive(u)}
                      >
                        {u.is_active ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Delete user"
                          onClick={() => handleDelete(u)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex w-28 items-center justify-end">
                      {u.id === currentUser?.id && (
                        <button
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                          title="Change my password"
                          onClick={() => setModal({ pw: u })}
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {users.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                <User className="mx-auto mb-2 h-8 w-8 opacity-40" />
                <p className="text-[13px]">No users found.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {modal === 'create' && (
        <Modal title="Add New User" onClose={closeModal}>
          <UserForm onSave={handleCreate} onClose={closeModal} loading={saving} error={formError} />
        </Modal>
      )}
      {modal?.edit && (
        <Modal title="Edit User" onClose={closeModal}>
          <UserForm initial={modal.edit} onSave={handleEdit} onClose={closeModal} loading={saving} error={formError} />
        </Modal>
      )}
      {modal?.pw && (
        <Modal title={`Change Password — ${modal.pw.name}`} onClose={closeModal}>
          <ChangePasswordForm userId={modal.pw.id} onClose={closeModal} />
        </Modal>
      )}
      </div>
    </PageLayout>
  )
}
