import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setImmediate as tick } from "node:timers/promises";
import {
  createNavigation,
  pageUrl,
  type NavigationRequest,
} from "../template/react-rsc/packages/plugin-web/web/navigation-state.ts";

function fixture(t: TestContext) {
  let now = 0;
  const requests: {
    url: string;
    signal: AbortSignal;
    resolve: (value: string) => void;
    reject: (reason: Error) => void;
  }[] = [];
  const rendered: { value: string; id: number; isCurrent: () => boolean }[] = [];
  const committed: { value: string; request: NavigationRequest }[] = [];
  const failures: NavigationRequest[] = [];
  const router = createNavigation({
    now: () => now,
    load: (url, signal) =>
      new Promise<string>((resolve, reject) => requests.push({ url, signal, resolve, reject })),
    render: (value, id, isCurrent) => rendered.push({ value, id, isCurrent }),
    commit: (value, request) => committed.push({ value, request }),
    fail: (request) => failures.push(request),
  });
  t.after(() => router.dispose());
  return {
    router,
    requests,
    rendered,
    committed,
    failures,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
const url = (path: string) => "http://localhost:3081" + path;

test("page navigation excludes external URLs, APIs, and static assets", () => {
  for (const href of [
    "https://example.com/page",
    "http://localhost:3082/page",
    "javascript:void(0)",
    "mailto:test@example.com",
    "/api/trpc/test",
    "/assets/app.js",
    "/healthz",
    "/favicon.ico",
    "/.env",
    "/@vite/client",
  ]) {
    assert.equal(pageUrl(href, url("/")), undefined, href);
  }
  assert.equal(pageUrl("?q=one#bottom", url("/todos"))!.href, url("/todos?q=one#bottom"));
});

test("visible streaming work survives a pending navigation and hash-only cancellation", async (t) => {
  const f = fixture(t);
  f.router.navigate({ url: url("/stream"), mode: "push" });
  await tick();
  f.requests[0]!.resolve("shell");
  await tick();
  f.router.committed(f.rendered[0]!.id);
  f.router.cancel();
  assert.equal(f.requests[0]!.signal.aborted, false);
  f.router.navigate({ url: url("/next"), mode: "push" });
  await tick();
  assert.equal(f.requests[0]!.signal.aborted, false);
  f.requests[1]!.resolve("next");
  await tick();
  f.router.committed(f.rendered[1]!.id);
  assert.equal(f.requests[0]!.signal.aborted, true);
});

test("navigation consumes a shared prefetch and waits for React to commit", async (t) => {
  const f = fixture(t);
  const first = f.router.prefetch(url("/todos#first"));
  const second = f.router.prefetch(url("/todos#second"));
  await tick();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0]!.url, url("/todos"));
  assert.deepEqual(f.router.getSnapshot(), { pending: false, target: null });
  f.router.navigate({ url: url("/todos#third"), mode: "replace", scroll: false });
  f.requests[0]!.resolve("todos");
  await Promise.all([first, second]);
  await tick();
  assert.equal(f.requests.length, 1);
  assert.equal(f.router.getSnapshot().pending, true);
  assert.equal(f.committed.length, 0);
  f.router.committed(f.rendered[0]!.id);
  assert.equal(f.router.getSnapshot().pending, false);
  assert.deepEqual(f.committed[0], {
    value: "todos",
    request: { url: url("/todos#third"), mode: "replace", scroll: false },
  });
  f.router.navigate({ url: url("/todos"), mode: "pop" });
  await tick();
  assert.equal(f.requests.length, 2, "Consumed entries are not a history cache");
});

test("prefetch expires after 30 seconds and distinguishes query strings", async (t) => {
  const f = fixture(t);
  void f.router.prefetch(url("/todos?q=a"));
  void f.router.prefetch(url("/todos?q=b"));
  await tick();
  f.advance(30000);
  f.router.navigate({ url: url("/todos?q=a"), mode: "push" });
  await tick();
  assert.equal(f.requests.length, 3);
  assert.equal(f.requests[0]!.signal.aborted, true);
  assert.equal(f.requests[1]!.signal.aborted, false);
});

test("prefetch retains at most 20 entries and evicts the least recently used", async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 20; i++) void f.router.prefetch(url("/page-" + i));
  await tick();
  void f.router.prefetch(url("/page-0"));
  void f.router.prefetch(url("/page-20"));
  await tick();
  assert.equal(f.requests.length, 21);
  assert.equal(f.requests[0]!.signal.aborted, false);
  assert.equal(f.requests[1]!.signal.aborted, true);
});

test("superseded navigation cannot render or commit even if transport ignores abort", async (t) => {
  const f = fixture(t);
  f.router.navigate({ url: url("/a"), mode: "push" });
  await tick();
  f.requests[0]!.resolve("a");
  await tick();
  f.router.navigate({ url: url("/b"), mode: "push" });
  assert.equal(f.requests[0]!.signal.aborted, true);
  assert.equal(f.rendered[0]!.isCurrent(), false);
  f.router.committed(f.rendered[0]!.id);
  assert.equal(f.committed.length, 0);
  await tick();
  f.requests[1]!.resolve("b");
  await tick();
  f.router.committed(f.rendered[1]!.id);
  assert.equal(f.committed[0]!.value, "b");
});

test("mutations invalidate prefetch, restart pending navigation, and pause speculative work", async (t) => {
  const f = fixture(t);
  void f.router.prefetch(url("/cached"));
  f.router.navigate({ url: url("/todos"), mode: "push" });
  await tick();
  f.router.mutationStart();
  await tick();
  assert.equal(f.requests[0]!.signal.aborted, true);
  assert.equal(f.requests[1]!.signal.aborted, true);
  await f.router.prefetch(url("/blocked"));
  assert.equal(f.requests.length, 3);
  f.router.mutationEnd();
  await tick();
  assert.equal(f.requests.length, 4);
  for (const request of f.requests.slice(0, 3)) request.resolve("stale");
  await tick();
  assert.equal(f.rendered.length, 0);
  f.requests[3]!.resolve("fresh");
  await tick();
  f.router.committed(f.rendered[0]!.id);
  assert.equal(f.committed[0]!.value, "fresh");
  void f.router.prefetch(url("/cached"));
  await tick();
  assert.equal(f.requests.length, 5);
});

test("concurrent mutations keep prefetch paused until all mutations settle", async (t) => {
  const f = fixture(t);
  f.router.mutationStart();
  f.router.mutationStart();
  f.router.mutationEnd();
  await f.router.prefetch(url("/todos"));
  assert.equal(f.requests.length, 0);
  f.router.mutationEnd();
  void f.router.prefetch(url("/todos"));
  await tick();
  assert.equal(f.requests.length, 1);
});

test("refresh bypasses prefetched data and background failures do not trigger navigation", async (t) => {
  const f = fixture(t);
  const speculative = f.router.prefetch(url("/todos"));
  await tick();
  f.requests[0]!.reject(new Error("offline"));
  await speculative;
  assert.equal(f.failures.length, 0);
  void f.router.prefetch(url("/todos"));
  await tick();
  f.router.refresh(url("/todos"));
  await tick();
  assert.equal(f.requests.length, 3);
  assert.equal(f.requests[1]!.signal.aborted, true);
  f.requests[2]!.reject(new Error("offline"));
  await tick();
  assert.equal(f.failures[0]!.mode, "refresh");
  assert.equal(f.router.getSnapshot().pending, false);
});

test("cancel and disposal abort work and ignore late responses", async (t) => {
  const f = fixture(t);
  f.router.navigate({ url: url("/todos"), mode: "push" });
  await tick();
  f.router.cancel();
  assert.equal(f.router.getSnapshot().pending, false);
  assert.equal(f.requests[0]!.signal.aborted, true);
  void f.router.prefetch(url("/another"));
  await tick();
  f.router.dispose();
  assert.equal(f.requests[1]!.signal.aborted, true);
  for (const request of f.requests) request.resolve("late");
  await tick();
  assert.equal(f.rendered.length, 0);
  await f.router.prefetch(url("/ignored"));
  f.router.navigate({ url: url("/ignored"), mode: "push" });
  assert.equal(f.requests.length, 2);
});
