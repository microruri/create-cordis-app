import type { WebPage } from "@acme/plugin-web/types";

export const pages = [
  {
    id: "todos",
    path: "/todos",
    title: "Todos",
    component: () => import("./todos/Page.tsx"),
  },
] satisfies WebPage[];
