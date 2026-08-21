/**
 * Centred sign-in shell, matching the IDP auth screen: STERIS mark, a
 * divider carrying the product name, then the heading and form.
 */
export default function AuthLayout({
  children,
  title = 'Sign in to your account',
  subtitle,
}) {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center"
      style={{ background: '#fff', fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div
        className="auth-card-wrapper relative z-10 w-full"
        style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}
      >
        <div
          className="auth-card"
          style={{
            background: '#ffffff',
            padding: '32px 44px 28px',
            animation: 'cardIn .5s cubic-bezier(.22,1,.36,1) both',
          }}
        >
          {/* Logo area */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: 20,
              gap: 14,
            }}
          >
            <img
              src="/assets/images/sterislogo.png"
              alt="STERIS"
              style={{ height: 42, width: 'auto', objectFit: 'contain' }}
            />
            {/* Divider with app name */}
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  color: '#7488a0',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                }}
              >
                Deviation Analyzer
              </span>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: 19,
                  fontWeight: 600,
                  color: '#0e1a2b',
                  letterSpacing: '-0.02em',
                  marginBottom: subtitle ? 3 : 0,
                }}
              >
                {title}
              </div>
              {subtitle && <div style={{ fontSize: 12.5, color: '#8a9aae' }}>{subtitle}</div>}
            </div>
          </div>

          {children}
        </div>
      </div>

      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(16px) scale(0.988); }
          to   { opacity: 1; transform: none; }
        }

        /* Small laptop screens (13–13.5 inch, typically ≤960px wide or ≤720px tall) */
        @media (max-width: 960px), (max-height: 720px) {
          .auth-card-wrapper { padding: 0 0px; }
          .auth-card {
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 24px 44px 20px !important;
          }
        }

        /* Extra small / mobile */
        @media (max-width: 480px) {
          .auth-card { padding: 20px 18px 16px !important; }
        }
      `}</style>
    </div>
  )
}
