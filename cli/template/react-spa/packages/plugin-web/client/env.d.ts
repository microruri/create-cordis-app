/// <reference types="vite/client" />
declare module "virtual:cordis-web" {
  const plugins: import("./types.ts").PluginFactory[];
  export default plugins;
}
