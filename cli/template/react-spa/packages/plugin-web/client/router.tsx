import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { ErrorPage, PluginPage, NotFound } from "./page.tsx";

const root = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
  errorComponent: () => <ErrorPage />,
});
const index = createRoute({ getParentRoute: () => root, path: "/", component: PluginPage });
const page = createRoute({ getParentRoute: () => root, path: "$", component: PluginPage });
export const router = createRouter({ routeTree: root.addChildren([index, page]) });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
