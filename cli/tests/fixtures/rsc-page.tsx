import "server-only";
import { Suspense } from "react";
import { redirect, notFound } from "@acme/plugin-web/server";
import type { ServerPageProps } from "@acme/plugin-web/types";

let retried = false;

export function beforeRender({ url }: ServerPageProps) {
  if (url.searchParams.has("redirect")) throw redirect({ to: "/hello-a" });
  if (url.searchParams.has("missing")) throw notFound();
  if (url.searchParams.has("failure")) throw new Error("ServerOnlySecret");
}

async function Content({ request, url, params, cordis }: ServerPageProps) {
  if (url.searchParams.has("retry") && !retried) {
    retried = true;
    throw new Error("Temporary test failure");
  }
  if (url.searchParams.has("slow")) {
    cordis.logger.info("Slow component started");
    await new Promise<void>((resolve, reject) => {
      const route = cordis.server.get("/api/test/release", (_req, res) => {
        res.json({ ok: true });
        cleanup();
        resolve();
      });
      const abort = () => {
        cordis.logger.info("Slow component aborted");
        cleanup();
        reject(request.signal.reason);
      };
      function cleanup() {
        route.dispose();
        request.signal.removeEventListener("abort", abort);
      }
      request.signal.addEventListener("abort", abort, { once: true });
      if (request.signal.aborted) abort();
    });
  }
  if (url.searchParams.has("lateFailure")) throw new Error("ServerOnlySecret");
  await new Promise((resolve) => setTimeout(resolve, 5));
  const value = url.searchParams.has("escape")
    ? '<script>alert("unsafe")</script>'
    : params.id
      ? "Item " + params.id
      : (request.headers.get("cookie") ?? "Request completed");
  return <p>{value}</p>;
}
export default function Page(props: ServerPageProps) {
  return (
    <section>
      <h1>Request shell</h1>
      <Suspense fallback={<p>Waiting for data</p>}>
        <Content {...props} />
      </Suspense>
    </section>
  );
}
