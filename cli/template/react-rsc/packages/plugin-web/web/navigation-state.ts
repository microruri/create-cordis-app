export interface NavigationState {
  pending: boolean;
  target: string | null;
}
export interface NavigationRequest {
  url: string;
  mode: "push" | "replace" | "pop" | "refresh";
  scroll?: boolean;
}
export const idle: NavigationState = { pending: false, target: null };

export function pageUrl(href: string, current: string) {
  const base = new URL(current);
  const url = new URL(href, base);
  if (
    url.origin !== base.origin ||
    !/^https?:$/.test(url.protocol) ||
    /[.@]/.test(url.pathname) ||
    /^\/(?:api|assets|healthz)(?:\/|$)/i.test(url.pathname)
  )
    return;
  return url;
}

// The transport stays independent of React and browser history.
export function createNavigation<T>(options: {
  load: (url: string, signal: AbortSignal, speculative: boolean) => Promise<T>;
  render: (value: T, id: number, isCurrent: () => boolean) => void;
  commit: (value: T, request: NavigationRequest) => void;
  fail: (request: NavigationRequest) => void;
  now?: () => number;
}) {
  interface Entry {
    controller: AbortController;
    promise: Promise<T>;
    created: number;
    timer?: ReturnType<typeof setTimeout>;
  }
  const now = options.now ?? Date.now;
  const cache = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let state = idle;
  let sequence = 0;
  let mutations = 0;
  let disposed = false;
  let visible: Entry | undefined;
  let active: { entry: Entry; request: NavigationRequest; id: number; value?: T } | undefined;
  const cacheKey = (url: string) => {
    const key = new URL(url);
    key.hash = "";
    return key.href;
  };
  function publish(next: NavigationState) {
    state = next;
    for (const listener of listeners) listener();
  }
  function remove(key: string, abort = true) {
    const entry = cache.get(key);
    if (!entry) return;
    cache.delete(key);
    clearTimeout(entry.timer);
    if (abort) entry.controller.abort();
    return entry;
  }
  function fresh(url: string, speculative = false): Entry {
    const controller = new AbortController();
    return {
      controller,
      promise: Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return options.load(url, controller.signal, speculative);
      }),
      created: now(),
    };
  }
  function cached(key: string) {
    const entry = cache.get(key);
    if (entry && now() - entry.created >= 30000) {
      remove(key);
      return;
    }
    return entry;
  }
  function clear() {
    for (const key of cache.keys()) remove(key);
  }
  function navigate(request: NavigationRequest, bypass = false) {
    if (disposed) return;
    if (active?.entry !== visible) active?.entry.controller.abort();
    const id = ++sequence;
    const key = cacheKey(request.url);
    const entry = !bypass && !mutations ? cached(key) : undefined;
    if (entry) remove(key, false);
    const current = {
      entry: entry ?? fresh(request.url),
      request,
      id,
      value: undefined as T | undefined,
    };
    active = current;
    publish({ pending: true, target: request.url });
    void current.entry.promise.then(
      (value) => {
        if (id !== sequence || disposed) return;
        current.value = value;
        options.render(value, id, () => !disposed && id === sequence);
      },
      () => {
        if (id !== sequence || disposed) return;
        active = undefined;
        publish(idle);
        options.fail(request);
      },
    );
  }
  function invalidate() {
    clear();
    if (state.pending && active) navigate(active.request, true);
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    isCurrent: (id: number) => !disposed && id === sequence,
    navigate,
    invalidate,
    committed(id: number) {
      if (!active || id !== sequence || !state.pending || active.value === undefined) return;
      if (visible !== active.entry) visible?.controller.abort();
      visible = active.entry;
      options.commit(active.value, active.request);
      publish(idle);
    },
    cancel() {
      sequence++;
      if (active?.entry !== visible) active?.entry.controller.abort();
      active = undefined;
      publish(idle);
    },
    async prefetch(url: string) {
      if (disposed || mutations) return;
      const key = cacheKey(url);
      let entry = cached(key);
      if (entry) {
        cache.delete(key);
        cache.set(key, entry);
      } else {
        entry = fresh(key, true);
        cache.set(key, entry);
        entry.timer = setTimeout(() => remove(key), 30000);
        while (cache.size > 20) remove(cache.keys().next().value!);
      }
      try {
        await entry.promise;
      } catch {
        if (cache.get(key) === entry) remove(key);
      }
    },
    refresh(url: string) {
      clear();
      navigate({ url, mode: "refresh" }, true);
    },
    mutationStart() {
      mutations++;
      invalidate();
    },
    mutationEnd() {
      mutations = Math.max(0, mutations - 1);
      invalidate();
    },
    dispose() {
      disposed = true;
      sequence++;
      clear();
      active?.entry.controller.abort();
      visible?.controller.abort();
      listeners.clear();
    },
  };
}
