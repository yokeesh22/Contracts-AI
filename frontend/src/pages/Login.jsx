import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, LogIn, XCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/AuthLayout'

// Exact palette + dimensions from the IDP login screen.
const PRIMARY = '#016ac9'
const PRIMARY_HOVER = '#0158aa'
const BG = '#f0f4f8'
const BORDER = '#e2e8f0'
const TEXT1 = '#0e1a2b'
const TEXT2 = '#4a5a6e'
const TEXT3 = '#8a9aae'
const ERROR = '#dc2626'
const ERROR_BG = '#fef2f2'

const inputStyle = {
  width: '100%',
  height: 40,
  background: BG,
  border: `1.5px solid ${BORDER}`,
  borderRadius: 9,
  color: TEXT1,
  fontFamily: 'inherit',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color .15s, background .15s, box-shadow .15s',
}

const focusInput = (e) => {
  e.currentTarget.style.borderColor = PRIMARY
  e.currentTarget.style.background = '#fff'
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(1,106,201,0.1)'
}

const blurInput = (e) => {
  e.currentTarget.style.borderColor = BORDER
  e.currentTarget.style.background = BG
  e.currentTarget.style.boxShadow = 'none'
}

const labelStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 12.5,
  fontWeight: 500,
  color: TEXT2,
  marginBottom: 7,
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [btnHover, setBtnHover] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }
    setLoading(true)
    try {
      await login(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid email or password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Sign in to your account">
      <form onSubmit={handleSubmit}>
        {/* Error banner */}
        {error && (
          <div
            style={{
              background: ERROR_BG,
              border: '1px solid rgba(220,38,38,0.2)',
              borderRadius: 9,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              fontSize: 13,
              color: ERROR,
              marginBottom: 18,
            }}
          >
            <XCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
            {error}
          </div>
        )}

        {/* Email */}
        <div style={{ marginBottom: 12 }}>
          <div style={labelStyle}>
            <span>Work email</span>
          </div>
          <div style={{ position: 'relative' }}>
            <Mail
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 16,
                height: 16,
                pointerEvents: 'none',
                color: TEXT3,
              }}
            />
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={focusInput}
              onBlur={blurInput}
              disabled={loading}
              style={{ ...inputStyle, padding: '0 14px 0 40px' }}
            />
          </div>
        </div>

        {/* Password */}
        <div style={{ marginBottom: 12 }}>
          <div style={labelStyle}>
            <span>Password</span>
            <button
              type="button"
              tabIndex={-1}
              style={{
                fontSize: 12,
                color: PRIMARY,
                background: 'none',
                border: 'none',
                padding: 0,
                fontWeight: 400,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              Forgot password?
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <Lock
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 16,
                height: 16,
                pointerEvents: 'none',
                color: TEXT3,
              }}
            />
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={focusInput}
              onBlur={blurInput}
              disabled={loading}
              style={{ ...inputStyle, padding: '0 44px 0 40px' }}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPw((v) => !v)}
              style={{
                position: 'absolute',
                right: 11,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 5,
                color: TEXT3,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {showPw ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
            </button>
          </div>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading}
          onMouseEnter={() => setBtnHover(true)}
          onMouseLeave={() => setBtnHover(false)}
          style={{
            marginTop: 16,
            width: '100%',
            height: 46,
            background: btnHover ? PRIMARY_HOVER : PRIMARY,
            border: 'none',
            borderRadius: 10,
            color: '#fff',
            fontFamily: 'inherit',
            fontSize: 14.5,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            letterSpacing: '0.005em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 1px 2px rgba(0,0,0,0.1), 0 4px 14px rgba(1,106,201,0.3)',
            transition: 'background .18s, box-shadow .18s',
            opacity: loading ? 0.8 : 1,
          }}
        >
          {loading ? (
            <div
              style={{
                width: 20,
                height: 20,
                border: '2px solid rgba(255,255,255,0.25)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin .65s linear infinite',
              }}
            />
          ) : (
            <>
              <LogIn style={{ width: 16, height: 16, flexShrink: 0 }} />
              Sign in
            </>
          )}
        </button>

        {/* Footer */}
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <span style={{ fontSize: 13, color: TEXT3 }}>Don't have an account? </span>
          <span style={{ fontSize: 13, color: PRIMARY, fontWeight: 500, cursor: 'not-allowed' }}>
            Contact admin
          </span>
        </div>

        <p style={{ marginTop: 26, textAlign: 'center', fontSize: 12, color: TEXT3 }}>
          © {new Date().getFullYear()} STERIS plc. All rights reserved.
        </p>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </form>
    </AuthLayout>
  )
}
