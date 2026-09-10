import React from "react";
import { isChunkLoadError, recoverFromStaleBuild } from "@/lib/chunk-recovery";

interface State { error: Error | null; recovering: boolean }

/**
 * Last line of defence around the whole app.
 *
 * Without a boundary here, any error thrown while rendering — including a
 * failed chunk load that got past the retry in lazy-pages — unmounts the tree
 * and leaves the page blank, with no clue that anything went wrong. A stale
 * build reloads itself; anything else at least says so and offers a way out.
 */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, recovering: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, recovering: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error) {
    if (!isChunkLoadError(error)) {
      console.error("[App] Unhandled render error:", error);
      return;
    }
    // The build this tab is running is gone. Reloading picks up the new one;
    // if we already tried that recently, fall through to the message.
    if (!recoverFromStaleBuild()) this.setState({ recovering: false });
  }

  render() {
    const { error, recovering } = this.state;
    if (!error) return this.props.children;

    // A reload is in flight — show the same quiet spinner as a page load
    // rather than flashing an error the user never needed to read.
    if (recovering) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-label="Loading"
          />
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-8 text-center shadow-lg">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            This page could not finish loading. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
