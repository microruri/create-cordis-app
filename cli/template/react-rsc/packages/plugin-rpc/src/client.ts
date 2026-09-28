import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AnyTRPCRouter } from "@trpc/server";

export function createPluginClient<TRouter extends AnyTRPCRouter>(
  apiBase: string,
  plugin: string,
  queryClient: QueryClient,
) {
  const client = createTRPCClient<TRouter>({
    links: [httpBatchLink<AnyTRPCRouter>({ url: `${apiBase}/trpc/${plugin}` })],
  });
  return createTRPCOptionsProxy<TRouter, { keyPrefix: true }>({
    client,
    queryClient,
    keyPrefix: `${apiBase}/${plugin}`,
  });
}
