import type { PageContextServer } from "vike/types";
import type {} from "../src/types.ts";
import { render } from "vike/abort";

export default function onCreatePageContext(pageContext: PageContextServer) {
  const owner = pageContext.config.cordisPlugin;
  if (owner && !pageContext.web.activePlugins.includes(owner))
    throw render(404, "This plugin is unavailable.");
}
