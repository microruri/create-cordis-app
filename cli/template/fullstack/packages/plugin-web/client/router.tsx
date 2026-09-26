import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Shell, Overview, PluginPage, NotFound } from "./shell.tsx";

const root = createRootRoute({ component: Shell, notFoundComponent: NotFound });
const overview = createRoute({ getParentRoute: () => root, path: "/", component: Overview });
const page = createRoute({ getParentRoute: () => root, path: "$", component: PluginPage });
export const router = createRouter({ routeTree: root.addChildren([overview, page]) });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
