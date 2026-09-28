import { use } from "react";
import { renderToReadableStream } from "react-dom/server.edge";
import { createFromReadableStream, getClientEntryUrl } from "@vitejs/plugin-rsc/ssr";
import { injectRSCPayload } from "rsc-html-stream/server";
import type { RscPayload } from "../src/types.ts";

export async function renderHtml(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onError: (error: unknown) => string,
) {
  const [renderStream, hydrationStream] = stream.tee();
  let payload: Promise<RscPayload> | undefined;
  function Root() {
    // Decode inside React's render context so client resources can be preloaded.
    payload ??= createFromReadableStream<RscPayload>(renderStream);
    return use(payload).root;
  }
  try {
    const html = await renderToReadableStream(<Root />, {
      bootstrapModules: [getClientEntryUrl()],
      signal,
      onError,
    });
    return { stream: html.pipeThrough(injectRSCPayload(hydrationStream)), failed: false };
  } catch (error) {
    void hydrationStream.cancel().catch(() => {});
    if (signal.aborted) throw error;
    onError(error);
    return {
      stream: await renderToReadableStream(
        <html lang="en">
          <head>
            <title>Something went wrong</title>
          </head>
          <body>
            <h1>Something went wrong</h1>
            <a href="/">Back to overview</a>
          </body>
        </html>,
      ),
      failed: true,
    };
  }
}
