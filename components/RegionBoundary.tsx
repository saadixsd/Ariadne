"use client";

import { Component, type ReactNode } from "react";

export class RegionBoundary extends Component<
  { name: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="m-3 bg-raised p-4 ring-1 ring-danger/50">
          <p className="font-semibold leading-tight">{this.props.name} hit an error</p>
          <p className="mt-1 text-sm leading-normal text-ink-dim">
            The rest of the workspace is still here. {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-3 bg-thread px-3 py-1.5 text-sm font-medium text-(--color-base) hover:bg-thread-bright"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
