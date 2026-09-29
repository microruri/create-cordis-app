import "server-only";
import { Suspense } from "react";
import type { ServerPageProps } from "@acme/plugin-web/types";
import type { Router } from "../../server/router.ts";
import Greeting from "./Greeting.tsx";

async function Content({ cordis, request }: ServerPageProps) {
  const hello = await cordis.rpc.caller<Router>("hello-b", request).hello();
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-base-content/60">
        {hello.app}
      </p>
      <p className="text-lg text-base-content/80 my-4">{hello.message}</p>
      <Greeting />
    </div>
  );
}
export default function Page(props: ServerPageProps) {
  return (
    <main className="card bg-base-100 border border-base-300 shadow-sm p-6 md:p-8 max-w-4xl mx-auto my-8">
      <h1 className="text-3xl font-semibold my-4">Hello B</h1>
      <Suspense fallback={<p role="status">Loading greeting...</p>}>
        <Content {...props} />
      </Suspense>
    </main>
  );
}
