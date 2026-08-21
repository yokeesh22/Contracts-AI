import { createContext, useContext, useState, useCallback } from 'react'
import { apiLogin } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const s = localStorage.getItem('da_user')
      return s ? JSON.parse(s) : null
    } catch { return null }
  })

  const login = useCallback(async (email, password) => {
    const data = await apiLogin(email, password) // throws on 401/403
    const u = { ...data, initial: data.name?.[0]?.toUpperCase() || 'U' }
    setUser(u)
    localStorage.setItem('da_user', JSON.stringify(u))
    return u
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    localStorage.removeItem('da_user')
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
