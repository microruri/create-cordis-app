import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import plugins from "virtual:cordis-web";
import { queryClient, updateRegistry, connect } from "./registry.ts";
import { router } from "./router.tsx";
import "./style.css";

updateRegistry(plugins);
const disconnect = connect();
const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

if (import.meta.hot) {
  import.meta.hot.accept("virtual:cordis-web", (module) => {
    if (module) updateRegistry(module.default);
  });
  import.meta.hot.dispose(() => {
    disconnect();
    root.unmount();
  });
}
