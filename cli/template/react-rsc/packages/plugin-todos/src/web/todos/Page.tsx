import "server-only";
import { Suspense } from "react";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { HydrationBoundary } from "@acme/plugin-web/client";
import { createPluginClient } from "@acme/plugin-rpc/client";
import type { ServerPageProps } from "@acme/plugin-web/types";
import type { Router } from "../../server/router.ts";
import Client from "./Client.tsx";

async function Content({ cordis, request }: ServerPageProps) {
  const queryClient = new QueryClient();
  const api = createPluginClient<Router>("/api", "todos", queryClient);
  const todos = await cordis.rpc.caller<Router>("todos", request).list();
  queryClient.setQueryData(api.list.queryKey(), todos);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Client />
    </HydrationBoundary>
  );
}
export default function Page(props: ServerPageProps) {
  return (
    <main className="card bg-base-100 border border-base-300 shadow-sm p-6 md:p-8 max-w-4xl mx-auto my-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-base-content/60">
        Your tasks
      </p>
      <h1 className="text-3xl font-semibold my-4">Todos</h1>
      <p className="text-base-content/70">A small place to keep track of what comes next.</p>
      <Suspense fallback={<p role="status">Loading todos...</p>}>
        <Content {...props} />
      </Suspense>
    </main>
  );
}
