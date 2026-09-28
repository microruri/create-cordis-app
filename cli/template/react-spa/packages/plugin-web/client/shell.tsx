import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRegistry } from "./registry.ts";
import { ContributionView } from "./contribution.tsx";

export function Shell() {
  const state = useRegistry();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="min-h-screen bg-base-200 text-base-content">
      <header className="navbar flex-wrap bg-base-100 border-b border-base-300 px-6 gap-4 justify-between">
        <Link className="text-xl font-bold" to="/">
          {state.title}
        </Link>
        <span className={`badge ${state.status === "online" ? "badge-success" : "badge-warning"}`}>
          {state.status}
        </span>
        <button
          className="btn btn-primary"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
        >
          Toggle navigation
        </button>
      </header>
      <div className="flex flex-col md:flex-row">
        {!collapsed && (
          <nav
            className="bg-base-100 border-b md:border-r border-base-300 p-4 md:w-56 shrink-0"
            aria-label="Main navigation"
          >
            <ul className="menu w-full gap-1 p-0">
              <li>
                <Link
                  to="/"
                  activeOptions={{ exact: true }}
                  activeProps={{ className: "menu-active" }}
                >
                  Overview
                </Link>
              </li>
              <li className="menu-title">Plugins</li>
              {state.entries
                .filter((entry) => state.active.some(({ name }) => name === entry.name))
                .flatMap((entry) =>
                  entry.pages.map((page) => (
                    <li key={entry.name + page.path}>
                      <Link
                        to={page.path}
                        activeProps={{ className: "menu-active" }}
                        onMouseEnter={() => {
                          void page.component().catch(() => {});
                          void page.load?.().catch(() => {});
                        }}
                      >
                        {page.title}
                      </Link>
                    </li>
                  )),
                )}
            </ul>
          </nav>
        )}
        <main className="flex-1 min-w-0 p-4 md:p-8">
          {state.error && (
            <p className="alert alert-error my-3" role="alert">
              {state.error}
            </p>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
export function Overview() {
  const state = useRegistry();
  return (
    <section className="card bg-base-100 border border-base-300 shadow-sm p-6 md:p-8 max-w-4xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-base-content/60">
        Your workspace
      </p>
      <h1 className="text-3xl font-semibold my-4">{state.title}</h1>
      <p>Pages and cards are provided by this app's active plugins.</p>
      <div className="grid gap-4 md:grid-cols-2 mt-6">
        {state.entries.flatMap((entry) => {
          const active = state.active.find(({ name }) => name === entry.name);
          if (!active || state.status !== "online") return [];
          return entry.cards.map((card) => (
            <article
              className="card bg-base-200 p-5 gap-3"
              key={`${entry.name}:${entry.generation}:${active.revision}:${card.id}`}
            >
              <ContributionView item={card} />
            </article>
          ));
        })}
      </div>
      {state.status === "offline" && <p role="status">Disconnected. Reconnecting...</p>}
    </section>
  );
}
export function PluginPage() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const state = useRegistry();
  const entry = state.entries.find((entry) => entry.pages.some((page) => page.path === pathname));
  const page = entry?.pages.find((page) => page.path === pathname);
  const active = state.active.find(({ name }) => name === entry?.name);
  useEffect(() => {
    if (active && page && state.status === "online") {
      void page.component().catch(() => {});
      void page.load?.().catch(() => {});
    }
  }, [page, active, state.status]);
  if (!entry || !page) return <NotFound />;
  if (state.status !== "online")
    return (
      <p role="status">
        {state.status === "offline" ? "Disconnected. Reconnecting..." : "Connecting..."}
      </p>
    );
  if (!active)
    return (
      <section className="card bg-base-100 border border-base-300 shadow-sm p-6 md:p-8 max-w-4xl">
        <h1 className="text-3xl font-semibold my-4">{page.title}</h1>
        <p role="status">This plugin is unavailable.</p>
      </section>
    );
  return (
    <ContributionView
      key={`${entry.name}:${entry.generation}:${active.revision}:${page.path}`}
      item={page}
    />
  );
}
export function NotFound() {
  return (
    <section className="card bg-base-100 border border-base-300 shadow-sm p-6 md:p-8 max-w-4xl">
      <h1 className="text-3xl font-semibold my-4">Page not found</h1>
      <Link to="/">Back to overview</Link>
    </section>
  );
}
