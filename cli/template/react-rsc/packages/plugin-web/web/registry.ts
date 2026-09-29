import plugins from "virtual:cordis-pages";
import type { RegisteredPage } from "../src/types.ts";

export function getPages(): RegisteredPage[] {
  const paths = new Map<string, string>();
  return plugins.flatMap(({ name, pages }) => {
    const ids = new Set<string>();
    return pages.map((page) => {
      if (!/^[a-z][a-z0-9-]*$/.test(page.id) || ids.has(page.id))
        throw new Error(`Invalid or duplicate page id ${name}:${page.id}`);
      ids.add(page.id);
      if (
        (page.path !== "/" &&
          !/^\/(?:[a-zA-Z0-9_-]+|\$[a-zA-Z][a-zA-Z0-9_]*)(?:\/(?:[a-zA-Z0-9_-]+|\$[a-zA-Z][a-zA-Z0-9_]*))*$/.test(
            page.path,
          )) ||
        /^\/(?:api|assets|healthz)(?:\/|$)/i.test(page.path)
      )
        throw new Error(`Invalid or reserved page path ${page.path} in ${name}`);
      const key = page.path.replace(/\$[^/]+/g, "$param").toLowerCase();
      const previous = paths.get(key);
      if (previous) throw new Error(`Duplicate page route ${page.path}: ${previous} and ${name}`);
      if (!page.title || typeof page.component !== "function")
        throw new Error(`Page ${name}:${page.id} needs a title and component importer`);
      paths.set(key, name);
      return { ...page, plugin: name };
    });
  });
}

export function matchPage(pages: RegisteredPage[], pathname: string) {
  let segments: string[];
  try {
    segments = pathname.replace(/\/$/, "").split("/").slice(1).map(decodeURIComponent);
  } catch {
    throw new Response(null, { status: 400 });
  }
  if (segments.some((segment) => /[/\\]/.test(segment))) return null;
  const candidates = [...pages].sort((a, b) => {
    const left = a.path.split("/");
    const right = b.path.split("/");
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      const order = Number(left[index]!.startsWith("$")) - Number(right[index]!.startsWith("$"));
      if (order) return order;
    }
    return 0;
  });
  for (const page of candidates) {
    const pattern = page.path === "/" ? [] : page.path.split("/").slice(1);
    if (pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    if (
      pattern.every((part, index) => {
        const value = segments[index]!;
        if (part.startsWith("$")) {
          params[part.slice(1)] = value;
          return !!value;
        }
        return part.toLowerCase() === value.toLowerCase();
      })
    )
      return { page, params };
  }
  return null;
}
