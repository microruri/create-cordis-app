#!/usr/bin/env node
if (process.argv.length !== 3 || process.argv[2] !== "build") {
  console.error("Usage: cordis-web build");
  process.exitCode = 1;
} else {
  try {
    const { buildWeb } = await import("../dist/build.js");
    await buildWeb(process.cwd());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
