import { fileURLToPath } from "node:url";

// The committed SQL migrations travel with this package. The database script
// resolves "./migrations" from each app manifest, including before any build,
// so this module stays plain JavaScript and must not import application code.
export function migrations() {
  return {
    migrationsFolder: fileURLToPath(new URL("./drizzle/", import.meta.url)),
  };
}
