import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Contains a render fault to the screen it happened on, so the navigation and
 * the rest of the shell stay usable. Reset when the route changes.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-500" />
          <div>
            <p className="font-display text-[15px] font-bold text-ink">This screen hit an error</p>
            <p className="mt-1 font-mono text-[12px] text-ink-2">{this.state.error.message}</p>
            <button onClick={() => this.setState({ error: null })} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-surface-2">
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
