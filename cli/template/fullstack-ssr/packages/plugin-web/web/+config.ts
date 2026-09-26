import type { Config } from "vike/types";
import type {} from "../src/types.ts";
import vikeReact from "vike-react/config";

export default {
  extends: [vikeReact],
  ssr: true,
  stream: false,
  clientRouting: true,
  passToClient: ["web"],
  meta: {
    cordisPlugin: { env: { server: true, client: true }, eager: true },
    title: { env: { server: true, client: true }, eager: true },
  },
} satisfies Config;
