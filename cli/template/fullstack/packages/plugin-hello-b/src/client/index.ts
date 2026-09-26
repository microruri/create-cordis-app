import { createElement } from "react";
import { createPluginClient } from "@acme/plugin-rpc/client";
import type { WebHost, WebPlugin } from "@acme/plugin-web/types";
import type { Router } from "../server/router.ts";

export type Api = ReturnType<typeof createPluginClient<Router>>;

export function createPlugin({ queryClient, apiBase }: WebHost): WebPlugin {
  const api = createPluginClient<Router>(apiBase, "hello-b", queryClient);
  return {
    queryFilter: api.pathFilter(),
    pages: [
      {
        path: "/hello-b",
        title: "Hello B",
        load: () =>
          queryClient.ensureQueryData(
            api.hello.queryOptions(undefined, { trpc: { abortOnUnmount: true } }),
          ),
        component: () =>
          import("./page.tsx").then(({ default: Page }) => ({
            default: () => createElement(Page, { api }),
          })),
      },
    ],
    cards: [
      {
        id: "hello-b",
        title: "Hello B",
        component: () =>
          import("./card.tsx").then(({ default: Card }) => ({
            default: () => createElement(Card, { api }),
          })),
      },
    ],
  } satisfies WebPlugin;
}
