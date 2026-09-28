import { lazy, useSyncExternalStore } from "react";
import { QueryClient } from "@tanstack/react-query";
import type { Contribution, PluginFactory, WebPlugin } from "./types.ts";
import { webStateSchema, type WebState } from "../src/shared.ts";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: false } },
});
function prepare<T extends Contribution>(item: T) {
  return { ...item, Component: lazy(item.component) };
}
export interface Entry {
  name: string;
  factory: PluginFactory["createPlugin"];
  plugin: WebPlugin;
  pages: ReturnType<typeof prepare<NonNullable<WebPlugin["pages"]>[number]>>[];
  cards: ReturnType<typeof prepare<NonNullable<WebPlugin["cards"]>[number]>>[];
  generation: number;
}
let state: {
  entries: Entry[];
  active: WebState["plugins"];
  title: string;
  status: "connecting" | "online" | "offline";
  error?: string;
} = { entries: [], active: [], title: "Cordis", status: "connecting" };
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};
export function useRegistry() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
function clear(entry: Entry) {
  if (!entry.plugin.queryFilter) return;
  void queryClient.cancelQueries(entry.plugin.queryFilter);
  queryClient.removeQueries(entry.plugin.queryFilter);
}
export function updateRegistry(factories: PluginFactory[]) {
  try {
    const paths = new Set<string>();
    const ids = new Set<string>();
    const names = new Set<string>();
    const entries = factories.map(({ name, createPlugin }) => {
      if (names.has(name)) throw new Error(`Duplicate frontend plugin: ${name}`);
      names.add(name);
      const old = state.entries.find((entry) => entry.name === name);
      const plugin =
        old?.factory === createPlugin ? old.plugin : createPlugin({ queryClient, apiBase: "/api" });
      for (const page of plugin.pages ?? []) {
        if (
          !/^\/[a-zA-Z0-9_/-]+$/.test(page.path) ||
          page.path.startsWith("/api/") ||
          paths.has(page.path)
        ) {
          throw new Error(`Invalid or duplicate page path "${page.path}" in ${name}`);
        }
        paths.add(page.path);
      }
      for (const card of plugin.cards ?? []) {
        if (!card.id || ids.has(card.id))
          throw new Error(`Invalid or duplicate card ID "${card.id}" in ${name}`);
        ids.add(card.id);
      }
      if (old?.factory === createPlugin) return old;
      return {
        name,
        factory: createPlugin,
        plugin,
        pages: (plugin.pages ?? []).map(prepare),
        cards: (plugin.cards ?? []).map(prepare),
        generation: (old?.generation ?? 0) + 1,
      };
    });
    for (const old of state.entries) if (!entries.includes(old)) clear(old);
    state = { ...state, entries, error: undefined };
  } catch (error) {
    state = { ...state, error: error instanceof Error ? error.message : String(error) };
  }
  emit();
}
export function connect() {
  let source: EventSource;
  let timer: ReturnType<typeof setTimeout>;
  let retry = 1000;
  let stopped = false;
  function open() {
    source = new EventSource("/api/web/events");
    source.onmessage = (event) => {
      let value: unknown;
      try {
        value = JSON.parse(event.data);
      } catch {
        return;
      }
      const result = webStateSchema.safeParse(value);
      if (!result.success) return;
      for (const entry of state.entries) {
        const before = state.active.find(({ name }) => name === entry.name);
        const after = result.data.plugins.find(({ name }) => name === entry.name);
        if (!after) clear(entry);
        else if (
          (!before || before.revision !== after.revision || state.status === "offline") &&
          entry.plugin.queryFilter
        ) {
          void queryClient.invalidateQueries(entry.plugin.queryFilter);
        }
      }
      state = { ...state, title: result.data.title, active: result.data.plugins, status: "online" };
      document.title = state.title;
      retry = 1000;
      emit();
    };
    source.onerror = () => {
      source.close();
      if (stopped) return;
      state = { ...state, status: "offline" };
      emit();
      timer = setTimeout(open, retry);
      retry = Math.min(retry * 2, 5000);
    };
  }
  open();
  return () => {
    stopped = true;
    clearTimeout(timer);
    source.close();
  };
}
