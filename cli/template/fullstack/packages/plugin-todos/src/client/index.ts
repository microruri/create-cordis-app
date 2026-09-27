import { createElement } from "react";
import { createPluginClient } from "@acme/plugin-rpc/client";
import type { WebHost, WebPlugin } from "@acme/plugin-web/types";
import type { Router } from "../server/router.ts";

export function createPlugin({ queryClient, apiBase }: WebHost): WebPlugin {
  const api = createPluginClient<Router>(apiBase, "todos", queryClient);
  return {
    queryFilter: api.pathFilter(),
    pages: [
      {
        path: "/todos",
        title: "Todos",
        load: () =>
          queryClient.ensureQueryData(api.list.queryOptions(undefined, { staleTime: 30000 })),
        component: () =>
          import("./Todos.tsx").then(({ default: Page }) => ({
            default: () => createElement(Page, { api }),
          })),
      },
    ],
  };
}
