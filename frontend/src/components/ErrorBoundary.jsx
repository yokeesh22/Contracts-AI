import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

/**
 * Catches render errors so one broken pane cannot take the whole app down.
 *
 * Without this, React unmounts the entire tree on any render error and the
 * user gets a blank white page with no explanation — which is exactly what a
 * conditional-hook bug in the document viewer produced. A blank screen tells
 * a user nothing and loses their place; this at least names the failure and
 * offers a way back.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Keep the component stack in the console for diagnosis; React only logs
    // it itself in development.
    console.error('Render error caught by boundary:', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-full min-h-[240px] items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div
            className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: 'var(--unacceptable-bg)', color: 'var(--unacceptable-fg)' }}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="text-[14px] font-semibold text-foreground">
            {this.props.label || 'Something went wrong here'}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            The rest of the page still works. Reloading usually clears it.
          </p>
          <p className="mt-2 break-words font-mono-num text-[11.5px] text-muted-foreground/80">
            {String(error.message || error)}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              className="btn-secondary h-8 px-3 text-[13px]"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
            <button
              type="button"
              className="btn-primary h-8 px-3 text-[13px]"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
