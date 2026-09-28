import { createFromReadableStream } from "@vitejs/plugin-rsc/browser";
import type { RscPayload } from "../src/types.ts";
import { createNavigation, pageUrl, type NavigationRequest } from "./navigation-state.ts";

export function navigation(
  update: (payload: RscPayload, id: number, isCurrent: () => boolean) => void,
) {
  const positions = new Map<string, [number, number]>();
  const stateKey = "__cordis";
  let key = history.state?.[stateKey] ?? crypto.randomUUID();
  const save = () => positions.set(key, [scrollX, scrollY]);
  function scrollToUrl(url: URL, position?: [number, number]) {
    if (position) return scrollTo(...position);
    if (url.hash) {
      let id: string;
      try {
        id = decodeURIComponent(url.hash.slice(1));
      } catch {
        id = url.hash.slice(1);
      }
      const target = document.getElementById(id) ?? document.getElementsByName(id)[0];
      if (target) return target.scrollIntoView();
    }
    scrollTo(0, 0);
  }
  const state = createNavigation({
    async load(href, signal, speculative) {
      const response = await fetch(href, { headers: { Accept: "text/x-component" }, signal });
      if (
        (speculative && !response.ok) ||
        !response.body ||
        !response.headers.get("content-type")?.startsWith("text/x-component")
      ) {
        await response.body?.cancel();
        throw new Error("Invalid page response");
      }
      const payload = await createFromReadableStream<RscPayload>(response.body);
      return { payload, url: response.url, redirected: response.redirected };
    },
    render: (value, id, isCurrent) => update(value.payload, id, isCurrent),
    commit(value, request) {
      const target = new URL(value.url);
      target.hash = new URL(request.url).hash;
      if (request.mode === "push") {
        key = crypto.randomUUID();
        history.pushState({ [stateKey]: key }, "", target);
      } else if (request.mode === "replace" || value.redirected) {
        history.replaceState({ ...history.state, [stateKey]: key }, "", target);
      }
      if (request.mode !== "refresh" && request.scroll !== false) {
        const position = request.mode === "pop" ? positions.get(key) : undefined;
        requestAnimationFrame(() => {
          if (!state.getSnapshot().pending) scrollToUrl(target, position);
        });
      }
    },
    fail(request) {
      // Also recovers from a deployment with stale client chunks.
      if (request.mode === "replace") location.replace(request.url);
      else location.assign(request.url);
    },
  });
  function visit(href: string, mode: NavigationRequest["mode"], options?: { scroll?: boolean }) {
    const url = pageUrl(href, location.href);
    if (!url) throw new Error("Navigation requires a same-origin page URL");
    save();
    if (url.pathname === location.pathname && url.search === location.search && url.hash) {
      state.cancel();
      if (mode === "push") {
        key = crypto.randomUUID();
        history.pushState({ [stateKey]: key }, "", url);
      } else history.replaceState({ ...history.state, [stateKey]: key }, "", url);
      if (options?.scroll !== false) scrollToUrl(url);
      return;
    }
    state.navigate({ url: url.href, mode, ...options });
  }
  function click(event: MouseEvent) {
    const link = (event.target instanceof Element ? event.target : null)?.closest("a");
    if (
      !(link instanceof HTMLAnchorElement) ||
      !link.hasAttribute("href") ||
      (link.target && link.target !== "_self") ||
      link.hasAttribute("download") ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !pageUrl(link.href, location.href)
    )
      return;
    event.preventDefault();
    visit(link.href, "push");
  }
  function pop() {
    save();
    key = history.state?.[stateKey] ?? crypto.randomUUID();
    history.replaceState({ ...history.state, [stateKey]: key }, "");
    state.navigate({ url: location.href, mode: "pop" });
  }
  const refresh = () => state.refresh(location.href);
  return {
    ...state,
    push: (href: string, options?: { scroll?: boolean }) => visit(href, "push", options),
    replace: (href: string, options?: { scroll?: boolean }) => visit(href, "replace", options),
    refresh,
    async prefetch(href: string) {
      const url = pageUrl(href, location.href);
      if (!url || (url.pathname === location.pathname && url.search === location.search)) return;
      await state.prefetch(url.href);
    },
    mount() {
      history.replaceState({ ...history.state, [stateKey]: key }, "");
      const previousRestoration = history.scrollRestoration;
      history.scrollRestoration = "manual";
      document.addEventListener("click", click);
      window.addEventListener("popstate", pop);
      if (import.meta.hot) import.meta.hot.on("rsc:update", refresh);
      if (import.meta.hot) import.meta.hot.on("vite:beforeUpdate", state.invalidate);
      return () => {
        state.dispose();
        document.removeEventListener("click", click);
        window.removeEventListener("popstate", pop);
        if (import.meta.hot) import.meta.hot.off("rsc:update", refresh);
        if (import.meta.hot) import.meta.hot.off("vite:beforeUpdate", state.invalidate);
        history.scrollRestoration = previousRestoration;
      };
    },
  };
}
