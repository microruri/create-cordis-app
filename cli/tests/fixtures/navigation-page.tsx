import "server-only";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { HydrationBoundary } from "@acme/plugin-web/client";
import type { ServerPageProps } from "@acme/plugin-web/types";
import Controls from "./Controls.tsx";

export default async function Page({ cordis, request }: ServerPageProps) {
  const value = await cordis.rpc.caller("navigation-test", request).read();
  const client = new QueryClient();
  client.setQueryData(["navigation-value"], value);
  return (
    <HydrationBoundary state={dehydrate(client)}>
      <h1>Navigation test</h1>
      <p id="server-value">Server value: {value}</p>
      <Controls />
    </HydrationBoundary>
  );
}
