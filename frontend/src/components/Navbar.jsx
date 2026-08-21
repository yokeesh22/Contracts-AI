import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, GitCompare,
  LogOut, Bell, Menu, X, Users, User as UserIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import SterisLogo from './SterisLogo'
import { cn } from '../lib/utils'

const BASE_LINKS = [
  { to: '/',               label: 'Dashboard',          icon: LayoutDashboard, end: true },
  { to: '/specifications', label: 'Specifications',     icon: FileText        },
  { to: '/analysis',       label: 'Deviation Analysis', icon: GitCompare      },
]
const ADMIN_LINKS = [
  { to: '/users', label: 'Users', icon: Users },
]

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const wrapRef = useRef(null)
  const isAdmin = user?.role === 'Administrator'
  const NAV_LINKS = isAdmin ? [...BASE_LINKS, ...ADMIN_LINKS] : BASE_LINKS

  useEffect(() => {
    const onClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const handleLogout = () => {
    setUserMenuOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  const initials = (user?.name || user?.email || 'U')
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <header
      className="sticky top-0 z-40 flex h-14 items-center px-5"
      style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 4px rgba(14,26,43,0.06)',
        color: '#0e1a2b',
      }}
    >
      {/* Brand */}
      <NavLink to="/" className="flex items-center gap-3.5 no-underline">
        <div style={{ height: 28, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
          <SterisLogo height={42} />
        </div>
        <div className="hidden h-5 w-px flex-shrink-0 sm:block" style={{ background: '#e2e8f0' }} />
        <span
          className="hidden sm:block"
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.13em',
            color: '#7488a0',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}
        >
          Deviation Analyzer
        </span>
      </NavLink>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Desktop nav */}
      <nav className="mr-3 hidden items-center gap-0.5 lg:flex">
        {NAV_LINKS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            style={{ display: 'flex', alignItems: 'center' }}
            className={({ isActive }) =>
              cn(
                'gap-1.5 rounded-md px-3.5 py-1.5 text-[13.5px] font-medium leading-none transition-colors',
                isActive
                  ? 'bg-[#eff6ff] text-[#016ac9]'
                  : 'text-[#4a5a6e] hover:bg-[#f0f4f8] hover:text-[#0e1a2b]',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" style={{ display: 'block' }} />
            <span className="leading-none">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Right cluster */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          title="Notifications"
          aria-label="Notifications"
          className="relative hidden h-[34px] w-[34px] items-center justify-center rounded-md text-[#6b7a8d] transition-colors hover:bg-[#f0f4f8] hover:text-[#0e1a2b] sm:flex"
        >
          <Bell className="h-[19px] w-[19px]" />
          <span
            className="absolute right-2 top-2 h-[7px] w-[7px] rounded-full"
            style={{ background: '#f59e0b', border: '1.5px solid #ffffff' }}
          />
        </button>

        <div className="mx-1.5 hidden h-6 w-px sm:block" style={{ background: '#e2e8f0' }} />

        {/* Profile */}
        <div ref={wrapRef} className="relative ml-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setUserMenuOpen((v) => !v)
            }}
            className="flex h-[34px] w-[34px] select-none items-center justify-center rounded-full border-[1.5px] text-xs font-semibold transition-colors"
            style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#016ac9' }}
            aria-label="Profile"
          >
            {initials}
          </button>

          {userMenuOpen && (
            <div
              className="absolute right-0 top-[calc(100%+9px)] w-[230px] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b px-4 pb-3 pt-3.5">
                <div className="text-[13.5px] font-semibold">{user?.name || 'User'}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{user?.email || user?.role}</div>
              </div>
              <div className="p-1.5">
                <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted-foreground">
                  <UserIcon className="h-[15px] w-[15px]" />
                  {user?.role}
                </div>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-red-600 transition-colors hover:bg-red-50"
                >
                  <LogOut className="h-[15px] w-[15px]" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-md text-[#6b7a8d] transition-colors hover:bg-[#f0f4f8] hover:text-[#0e1a2b] lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="absolute left-0 right-0 top-14 space-y-1 border-b bg-card px-4 py-2 shadow-bar lg:hidden">
          {NAV_LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-colors',
                  isActive
                    ? 'bg-[#eff6ff] text-[#016ac9]'
                    : 'text-[#4a5a6e] hover:bg-[#f0f4f8] hover:text-[#0e1a2b]',
                )
              }
              onClick={() => setMobileOpen(false)}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  )
}
