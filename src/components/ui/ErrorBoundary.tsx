import { Component, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';

/**
 * Contains a render fault to the screen it happened on, so the navigation and
 * the rest of the shell stay usable. Reset when the route changes.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; details: boolean }> {
  state: { error: Error | null; details: boolean } = { error: null, details: false };

  static getDerivedStateFromError(error: Error) {
    return { error, details: false };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card p-5" role="alert">
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-300">
            <TriangleAlert className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold text-ink">This screen could not be displayed</p>
            <p className="mt-0.5 text-sm text-ink-2">The rest of LandPulse AI is still available from the navigation. Try loading the screen again.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button onClick={() => this.setState({ error: null })} className="inline-flex h-8 items-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-ink shadow-xs hover:bg-surface-2 focus-ring">
                Try again
              </button>
              <button onClick={() => this.setState((s) => ({ details: !s.details }))} className="text-xs font-medium text-ink-3 hover:text-ink-2">
                {this.state.details ? 'Hide' : 'Show'} technical details
              </button>
            </div>
            {this.state.details && <p className="mt-2 break-words rounded-md bg-surface-2 px-2.5 py-2 font-mono text-xs text-ink-2">{this.state.error.message}</p>}
          </div>
        </div>
      </div>
    );
  }
}
