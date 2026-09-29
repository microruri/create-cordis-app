---
name: tailwind-daisyui
description: "Style plugin pages and shared UI with the workspace's Tailwind CSS and daisyUI setup, including source scanning, themes, and accessible interactions."
---

# Tailwind CSS and daisyUI

Read the shared [stylesheet](../../../packages/plugin-web/web/style.css) and
[styling guide](../../../README.md#styling) before adding configuration. Use
existing Hello and Todos markup as small examples of the current visual language.

## Project integration

- Tailwind runs through the host's Vite plugin. The CSS entry owns Tailwind,
  daisyUI, and theme configuration; use that entry for shared changes.
- Pages own their semantic containers, spacing, and navigation. The host imports
  the stylesheet without adding an application layout; keep that entry present
  for both blank documents and plugin pages.
- Source detection is explicit (`source(none)` plus `@source`). Shared web code
  and business-plugin `src/web` directories are covered. Add a source path when
  moving UI into another package, and check its classes in a production build.
- Keep complete utility/component class names in source. Choose among literal
  variants rather than constructing fragments that the scanner cannot discover.
- Use daisyUI component classes, semantic color tokens, and Tailwind utilities.
  The configured light/dark themes follow the system preference; check both when
  changing colors, contrast, or shared components.
- Styling alone does not need a `"use client"` boundary. Keep event/state logic
  in the small interactive component that owns it.
- Retain labels, keyboard access, visible focus, disabled/pending feedback, and
  accessible status/error messages when adapting forms and navigation.

For a UI change, inspect the relevant page at narrow and wide widths, check
keyboard interaction, and verify CSS HMR. For source scanning or theme integration
changes, also verify built CSS in both apps. Reuse the current stack unless the
task explicitly changes the UI architecture.

## Official references

- [Tailwind CSS documentation](https://tailwindcss.com/docs)
- [daisyUI documentation index](https://daisyui.com/llms.txt)

Use documentation matching the installed major versions; this workspace uses the
CSS-based Tailwind configuration style.
