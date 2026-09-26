import type { PageContext } from "vike/types";
import type {} from "../src/types.ts";

export function navigation(context: PageContext) {
  return Object.values(context.globalContext.pages)
    .filter(
      (page) =>
        page.config.cordisPlugin && context.web.activePlugins.includes(page.config.cordisPlugin),
    )
    .flatMap((page) =>
      typeof page.route === "string" && !/[@*]/.test(page.route)
        ? [{ href: page.route, title: String(page.config.title ?? page.route) }]
        : [],
    );
}
