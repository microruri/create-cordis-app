import { Component, startTransition, useEffect, useState, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { createFromReadableStream } from "@vitejs/plugin-rsc/browser";
import { rscStream } from "rsc-html-stream/client";
import type { RscPayload } from "../src/types.ts";
import { navigation } from "./navigation.ts";
import { NavigationContext, NavigationRevision } from "./router-context.ts";

class RootBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <html lang="en">
          <head>
            <title>Something went wrong</title>
          </head>
          <body>
            <h1>Something went wrong</h1>
            <a href="/">Reload the app</a>
          </body>
        </html>
      );
    return this.props.children;
  }
}
export function BrowserRoot({ initial }: { initial: RscPayload }) {
  const [{ payload, id }, setPayload] = useState({ payload: initial, id: 0 });
  const [router] = useState(() =>
    navigation((next, id, isCurrent) => {
      startTransition(() =>
        setPayload((previous) => (isCurrent() ? { payload: next, id } : previous)),
      );
    }),
  );
  useEffect(() => router.mount(), [router]);
  useEffect(() => {
    router.committed(id);
  }, [router, id]);
  return (
    <NavigationContext value={router}>
      <NavigationRevision value={id}>{payload.root}</NavigationRevision>
    </NavigationContext>
  );
}

async function main() {
  const initial = await createFromReadableStream<RscPayload>(rscStream);
  hydrateRoot(
    document,
    <RootBoundary>
      <BrowserRoot initial={initial} />
    </RootBoundary>,
  );
}
void main();
