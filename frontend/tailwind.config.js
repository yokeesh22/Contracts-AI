/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── IDP design-system tokens (values live in index.css) ──────────────
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
          hover: 'var(--brand-primary-hover)',
          light: 'var(--brand-primary-light)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: 'var(--destructive)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',

        // Legacy Steris scale, remapped onto the IDP brand blue so any
        // remaining `steris-*` utility keeps resolving to the new palette.
        steris: {
          50:  '#f0f6fd',
          100: '#e8f2fc',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#3b8de0',
          500: '#0d7ad6',
          600: '#016ac9',
          700: '#0158aa',
          800: '#0e1520',
          900: '#0b121d',
        },
      },
      borderRadius: {
        sm: 'calc(var(--radius) - 4px)',
        md: 'calc(var(--radius) - 2px)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 4px)',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(14,21,32,0.07)',
        'card-hover': '0 6px 18px rgba(14,21,32,0.08)',
        bar: '0 1px 4px rgba(14,26,43,0.06)',
      },
    },
  },
  plugins: [],
}
