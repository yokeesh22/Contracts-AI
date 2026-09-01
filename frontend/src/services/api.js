import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
})

// ── Playbooks ────────────────────────────────────────────────────────────────

export const getPlaybooks = () => api.get('/playbooks').then((r) => r.data)

export const getPlaybook = (id) => api.get(`/playbooks/${id}`).then((r) => r.data)

export const createPlaybook = (data) =>
  api.post('/playbooks', data).then((r) => r.data)

export const updatePlaybook = (id, data) =>
  api.patch(`/playbooks/${id}`, data).then((r) => r.data)

export const deletePlaybook = (id) => api.delete(`/playbooks/${id}`)

export const getRules = (playbookId) =>
  api.get(`/playbooks/${playbookId}/rules`).then((r) => r.data)

export const createRule = (playbookId, data) =>
  api.post(`/playbooks/${playbookId}/rules`, data).then((r) => r.data)

export const updateRule = (playbookId, ruleId, data) =>
  api.patch(`/playbooks/${playbookId}/rules/${ruleId}`, data).then((r) => r.data)

export const deleteRule = (playbookId, ruleId) =>
  api.delete(`/playbooks/${playbookId}/rules/${ruleId}`)

// ── Contract reviews ─────────────────────────────────────────────────────────

export const getReviews = () => api.get('/reviews').then((r) => r.data)

/** One negotiation. Omit `versionId` for the latest round, which is the default view. */
export const getReview = (id, versionId) =>
  api
    .get(`/reviews/${id}`, versionId ? { params: { version_id: versionId } } : undefined)
    .then((r) => r.data)

export const createReview = (
  { playbookId, name, counterparty, file },
  onProgress,
) => {
  const form = new FormData()
  form.append('playbook_id', playbookId)
  form.append('name', name)
  if (counterparty) form.append('counterparty', counterparty)
  form.append('file', file)
  return api
    .post('/reviews', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0, // large uploads may legitimately exceed the default 60s
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    })
    .then((r) => r.data)
}

export const deleteReview = (id) => api.delete(`/reviews/${id}`)

/** Upload the version the counterparty sent back; starts the next round. */
export const addRound = ({ reviewId, file, note }, onProgress) => {
  const form = new FormData()
  form.append('file', file)
  if (note) form.append('note', note)
  return api
    .post(`/reviews/${reviewId}/rounds`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    })
    .then((r) => r.data)
}

// ── Negotiation status ───────────────────────────────────────────────────────
// Only two transitions are ever a human's to make. Everything else follows from
// what the app can observe, so there is no button for it.

/** "I emailed the redline." The one thing the app cannot see for itself. */
export const markSentToVendor = (id, { sentAt, note } = {}) =>
  api
    .post(`/reviews/${id}/sent`, { sent_at: sentAt || null, note: note || null })
    .then((r) => r.data)

export const markComplete = (id, note) =>
  api.post(`/reviews/${id}/complete`, { note: note || null }).then((r) => r.data)

export const setReviewStatus = (id, status, note) =>
  api.patch(`/reviews/${id}/status`, { status, note: note || null }).then((r) => r.data)

/** Move one negotiating point in the ledger — agreed, conceded, dropped. */
export const updateIssue = (reviewId, issueId, status) =>
  api.patch(`/reviews/${reviewId}/issues/${issueId}`, { status }).then((r) => r.data)

// Direct URL to a round's upload — used for download and the PDF fallback.
export const contractFileUrl = (id, versionId) =>
  versionId ? `/api/reviews/${id}/file?version_id=${versionId}` : `/api/reviews/${id}/file`

// ── Redline editing ──────────────────────────────────────────────────────────

export const updateRedline = (reviewId, redlineId, data) =>
  api.patch(`/reviews/${reviewId}/redlines/${redlineId}`, data).then((r) => r.data)

export const createRedline = (reviewId, data) =>
  api.post(`/reviews/${reviewId}/redlines`, data).then((r) => r.data)

export const deleteRedline = (reviewId, redlineId) =>
  api.delete(`/reviews/${reviewId}/redlines/${redlineId}`)

// ── Exports ──────────────────────────────────────────────────────────────────

function downloadBlob(response, fallbackName) {
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  const disposition = response.headers['content-disposition'] || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  link.download = match ? match[1] : fallbackName
  link.click()
  window.URL.revokeObjectURL(url)
}

/** The marked-up contract as a Word file with tracked changes. */
export const exportRedline = (reviewId, versionId) =>
  api
    .get(`/reviews/${reviewId}/export/redline`, {
      responseType: 'blob',
      params: versionId ? { version_id: versionId } : undefined,
    })
    .then((r) => {
      downloadBlob(r, `Redline_${reviewId}.docx`)
      // "false" for PDF sources, where formatting could not be preserved.
      return r.headers['x-export-faithful'] !== 'false'
    })

/** The issues list — the tabular summary for circulation. */
export const exportIssues = (reviewId, versionId) =>
  api
    .get(`/reviews/${reviewId}/export/issues`, {
      responseType: 'blob',
      params: versionId ? { version_id: versionId } : undefined,
    })
    .then((r) => downloadBlob(r, `IssuesList_${reviewId}.docx`))

// ── Stats ────────────────────────────────────────────────────────────────────

export const getStats = () => api.get('/stats').then((r) => r.data)

// ── Auth ─────────────────────────────────────────────────────────────────────

export const apiLogin = (email, password) =>
  api.post('/auth/login', { email, password }).then((r) => r.data)

// ── Users ────────────────────────────────────────────────────────────────────

export const getUsers = () => api.get('/users').then((r) => r.data)

export const createUser = (data) => api.post('/users', data).then((r) => r.data)

export const updateUser = (id, data) =>
  api.patch(`/users/${id}`, data).then((r) => r.data)

export const deleteUser = (id) => api.delete(`/users/${id}`)

export const changePassword = (id, currentPassword, newPassword) =>
  api.post(`/users/${id}/change-password`, {
    current_password: currentPassword,
    new_password: newPassword,
  })
