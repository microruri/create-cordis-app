"use client";
import { Component, useContext, useState, type ReactNode } from "react";
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
  HydrationBoundary as QueryHydrationBoundary,
  type HydrationBoundaryProps,
} from "@tanstack/react-query";
import { NavigationContext, NavigationRevision, useRouter } from "./router-context.ts";
import "./style.css";

// Keep hydration and its provider on the same Vite dependency entry in development.
export function HydrationBoundary(props: HydrationBoundaryProps) {
  return <QueryHydrationBoundary {...props} />;
}

export function Providers({ children }: { children: ReactNode }) {
  const router = useContext(NavigationContext);
  const [client] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onMutate: () => router?.mutationStart(),
          onSettled: () => router?.mutationEnd(),
        }),
        defaultOptions: { queries: { staleTime: 30000, retry: false } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
export function PageBoundary({ children }: { children: ReactNode }) {
  const revision = useContext(NavigationRevision);
  const router = useRouter();
  return (
    <PageErrorBoundary revision={revision} retry={router.refresh}>
      {children}
    </PageErrorBoundary>
  );
}
export function ErrorPage({ notFound = false, retry }: { notFound?: boolean; retry?: () => void }) {
  const router = useRouter();
  return (
    <main role="alert">
      <h1>{notFound ? "Page not found" : "Something went wrong"}</h1>
      {!notFound && (
        <button type="button" onClick={retry ?? router.refresh}>
          Retry
        </button>
      )}
    </main>
  );
}
class PageErrorBoundary extends Component<
  { children: ReactNode; revision: number; retry: () => void },
  { failed: boolean; revision: number }
> {
  state = { failed: false, revision: this.props.revision };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(props: { revision: number }, state: { revision: number }) {
    return props.revision !== state.revision ? { failed: false, revision: props.revision } : null;
  }
  componentDidCatch(error: unknown) {
    console.error(error);
  }
  render() {
    if (this.state.failed) return <ErrorPage retry={this.props.retry} />;
    return this.props.children;
  }
}
