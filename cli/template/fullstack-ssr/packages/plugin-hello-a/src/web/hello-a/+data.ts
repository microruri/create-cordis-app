import type { PageContextServer } from "vike/types";
import type {} from "@acme/plugin-web/types";
import type { Router } from "../../server/router.ts";

export default async function data({ cordis, request }: PageContextServer) {
  const hello = await cordis.rpc.caller<Router>("hello-a", request).hello();
  return { hello, updatedAt: Date.now() };
}
export type Data = Awaited<ReturnType<typeof data>>;
