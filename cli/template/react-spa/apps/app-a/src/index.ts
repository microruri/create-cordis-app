import { runApp } from "@acme/runtime";

await runApp(new URL("../", import.meta.url));
