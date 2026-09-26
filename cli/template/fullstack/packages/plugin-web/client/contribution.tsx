import {
  Component,
  Suspense,
  type ReactNode,
  type LazyExoticComponent,
  type ComponentType,
} from "react";
import type { Contribution } from "./types.ts";

class Boundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  render() {
    if (this.state.error)
      return (
        <p role="alert">
          {this.state.error} <button onClick={() => this.setState({ error: null })}>Retry</button>
        </p>
      );
    return this.props.children;
  }
}
export function ContributionView({
  item,
}: {
  item: Contribution & { Component: LazyExoticComponent<ComponentType> };
}) {
  return (
    <Boundary>
      <Suspense fallback={<p role="status">Loading {item.title}...</p>}>
        <item.Component />
      </Suspense>
    </Boundary>
  );
}
