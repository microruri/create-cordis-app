/// <reference types="@vitejs/plugin-rsc/types" />
declare module "server-only" {}
declare module "virtual:cordis-pages" {
  const plugins: { name: string; pages: import("../src/types.ts").WebPage[] }[];
  export default plugins;
}
