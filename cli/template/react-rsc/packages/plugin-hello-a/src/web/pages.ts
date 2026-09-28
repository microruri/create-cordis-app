import type { WebPage } from "@acme/plugin-web/types";

export const pages = [
  {
    id: "hello",
    path: "/hello-a",
    title: "Hello A",
    component: () => import("./hello-a/Page.tsx"),
  },
] satisfies WebPage[];
