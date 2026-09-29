import { Suspense, type ReactNode } from "react";
import { renderToReadableStream } from "@vitejs/plugin-rsc/rsc/server";
import type { RenderOptions, RscPayload, ServerPageProps } from "../src/types.ts";
import { getPages, matchPage } from "./registry.ts";
import { Providers, PageBoundary, ErrorPage } from "./providers.tsx";

export function validate() {
  getPages();
}

export async function render({ cordis, request, web }: RenderOptions): Promise<Response> {
  const url = new URL(request.url);
  const pages = getPages();
  const wantsRsc = request.headers
    .get("accept")
    ?.split(",")
    .some(
      (value) =>
        value.trim().split(";")[0] === "text/x-component" && !/;\s*q=0(?:\.0*)?(?:;|$)/.test(value),
    );
  const headers = new Headers({
    "Content-Type": wantsRsc ? "text/x-component; charset=utf-8" : "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Accept",
  });
  let content: ReactNode = null;
  let title = web.title;
  let status = 200;
  try {
    const match = matchPage(pages, url.pathname);
    if (match && web.activePlugins.includes(match.page.plugin)) {
      const page = await match.page.component();
      const props: ServerPageProps = { cordis, request, url, params: match.params };
      await page.beforeRender?.(props);
      title = match.page.title + " | " + web.title;
      content = <page.default {...props} />;
    } else if (url.pathname !== "/") throw new Response(null, { status: 404 });
  } catch (error) {
    if (request.signal.aborted) throw error;
    if (error instanceof Response) {
      const location = error.headers.get("Location");
      if (location) {
        headers.set("Location", location);
        return new Response(null, { status: error.status, headers });
      }
      status = error.status;
    } else {
      status = 500;
      cordis.logger.error(error);
    }
    title = (status === 404 ? "Page not found" : "Something went wrong") + " | " + web.title;
    content = <ErrorPage notFound={status === 404} />;
  }
  if (request.method === "HEAD") return new Response(null, { status, headers });
  const payload: RscPayload = {
    root: (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{title}</title>
          <link rel="icon" href="data:," />
        </head>
        <body>
          <Providers>
            <PageBoundary key={url.pathname + url.search}>
              <Suspense fallback={null}>{content}</Suspense>
            </PageBoundary>
          </Providers>
        </body>
      </html>
    ),
  };
  const onError = (error: unknown) => {
    if (!request.signal.aborted) cordis.logger.error(error);
    return "Unable to render this page";
  };
  const stream = renderToReadableStream(payload, { signal: request.signal, onError });
  if (wantsRsc) return new Response(stream, { status, headers });
  const ssr = await import.meta.viteRsc.loadModule<typeof import("./entry-ssr.tsx")>(
    "ssr",
    "index",
  );
  const result = await ssr.renderHtml(stream, request.signal, onError);
  return new Response(result.stream, { status: result.failed ? 500 : status, headers });
}
