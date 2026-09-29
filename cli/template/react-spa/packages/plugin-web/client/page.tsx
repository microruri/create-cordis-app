import { Component, lazy, Suspense, useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { useRegistry } from "./registry.ts";
import type { WebPage } from "./types.ts";

export function ErrorPage({ retry }: { retry?: () => void }) {
  return (
    <main role="alert">
      <h1>Something went wrong</h1>
      <button type="button" onClick={retry ?? (() => location.reload())}>
        {retry ? "Retry" : "Reload page"}
      </button>
    </main>
  );
}

export function NotFound() {
  return <p role="alert">Page not found</p>;
}

class PageView extends Component<{ page: WebPage }> {
  state = { failed: false, Page: lazy(this.props.page.component) };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(error);
  }
  retry = () => this.setState({ failed: false, Page: lazy(this.props.page.component) });
  render() {
    if (this.state.failed) return <ErrorPage retry={this.retry} />;
    const Page = this.state.Page;
    return (
      <Suspense fallback={null}>
        <Page />
      </Suspense>
    );
  }
}

export function PluginPage() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const state = useRegistry();
  const entry = state.entries.find((entry) => entry.pages.some((page) => page.path === pathname));
  const page = entry?.pages.find((page) => page.path === pathname);
  const active = state.active.find(({ name }) => name === entry?.name);
  useEffect(() => {
    if (active && page && state.status === "online" && !state.error) {
      void page.load?.().catch(() => {});
    }
  }, [page, active, state.status, state.error]);
  if (state.error) return <ErrorPage />;
  if (!entry || !page) return pathname === "/" ? null : <NotFound />;
  if (state.status === "connecting") return null;
  if (state.status === "offline") return <p role="status">Disconnected. Reconnecting...</p>;
  if (!active) return pathname === "/" ? null : <NotFound />;
  return (
    <PageView
      key={`${entry.name}:${entry.generation}:${active.revision}:${page.path}`}
      page={page}
    />
  );
}
