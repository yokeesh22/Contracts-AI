import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
})

// ── Specifications ──────────────────────────────────────────────────────────

export const getSpecifications = () =>
  api.get('/specifications').then((r) => r.data)

export const getSpecification = (id) =>
  api.get(`/specifications/${id}`).then((r) => r.data)

export const uploadSpecification = (name, file, onProgress) => {
  const form = new FormData()
  form.append('name', name)
  form.append('file', file)
  return api
    .post('/specifications', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0, // large uploads may legitimately exceed the default 60s
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    })
    .then((r) => r.data)
}

export const deleteSpecification = (id) => api.delete(`/specifications/${id}`)

// Direct URL to the original uploaded document (rendered by the viewer page).
export const specFileUrl = (id) => `/api/specifications/${id}/file`

// ── Deviation Analysis ───────────────────────────────────────────────────────

export const getSessions = () => api.get('/deviation').then((r) => r.data)

export const getSession = (id) =>
  api.get(`/deviation/${id}`).then((r) => r.data)

export const createAnalysis = (specId, ursName, ursFile, onProgress) => {
  const form = new FormData()
  form.append('spec_id', specId)
  form.append('urs_name', ursName)
  form.append('urs_file', ursFile)
  return api
    .post('/deviation', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0, // large uploads may legitimately exceed the default 60s
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    })
    .then((r) => r.data)
}

export const exportExceptionList = (sessionId) => {
  return api
    .get(`/deviation/${sessionId}/export`, { responseType: 'blob' })
    .then((r) => {
      const url = window.URL.createObjectURL(new Blob([r.data]))
      const link = document.createElement('a')
      link.href = url
      const disposition = r.headers['content-disposition'] || ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      link.download = match ? match[1] : `ExceptionList_${sessionId}.docx`
      link.click()
      window.URL.revokeObjectURL(url)
    })
}

export const deleteSession = (id) => api.delete(`/deviation/${id}`)

// Direct URL to the original uploaded URS document (rendered by the viewer page).
export const ursFileUrl = (id) => `/api/deviation/${id}/urs-file`

// ── Stats ────────────────────────────────────────────────────────────────────

export const getStats = () => api.get('/stats').then((r) => r.data)

// ── Auth ─────────────────────────────────────────────────────────────────────

export const apiLogin = (email, password) =>
  api.post('/auth/login', { email, password }).then((r) => r.data)

// ── Users ─────────────────────────────────────────────────────────────────────

export const getUsers = () => api.get('/users').then((r) => r.data)

export const createUser = (data) => api.post('/users', data).then((r) => r.data)

export const updateUser = (id, data) => api.patch(`/users/${id}`, data).then((r) => r.data)

export const deleteUser = (id) => api.delete(`/users/${id}`)

export const changePassword = (id, currentPassword, newPassword) =>
  api.post(`/users/${id}/change-password`, {
    current_password: currentPassword,
    new_password: newPassword,
  })
