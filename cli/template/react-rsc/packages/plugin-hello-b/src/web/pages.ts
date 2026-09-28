import type { WebPage } from "@acme/plugin-web/types";

export const pages = [
  {
    id: "hello",
    path: "/hello-b",
    title: "Hello B",
    component: () => import("./hello-b/Page.tsx"),
  },
] satisfies WebPage[];
