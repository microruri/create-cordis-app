import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRegistry } from "./registry.ts";
import { ContributionView } from "./contribution.tsx";

export function Shell() {
  const state = useRegistry();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="layout">
      <header>
        <Link className="brand" to="/">
          {state.title}
        </Link>
        <span className={`status ${state.status}`}>
          <i />
          {state.status}
        </span>
        <button onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>
          Toggle navigation
        </button>
      </header>
      <div className="workspace">
        {!collapsed && (
          <nav aria-label="Main navigation">
            <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: "active" }}>
              Overview
            </Link>
            <p className="eyebrow">Plugins</p>
            {state.entries
              .filter((entry) => state.active.some(({ name }) => name === entry.name))
              .flatMap((entry) =>
                entry.pages.map((page) => (
                  <Link
                    key={entry.name + page.path}
                    to={page.path}
                    activeProps={{ className: "active" }}
                    onMouseEnter={() => {
                      void page.component().catch(() => {});
                      void page.load?.().catch(() => {});
                    }}
                  >
                    {page.title}
                  </Link>
                )),
              )}
          </nav>
        )}
        <main>
          {state.error && <p role="alert">{state.error}</p>}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
export function Overview() {
  const state = useRegistry();
  return (
    <section className="panel">
      <p className="eyebrow">Your workspace</p>
      <h1>{state.title}</h1>
      <p>Pages and cards are provided by this app's active plugins.</p>
      <div className="overview-grid">
        {state.entries.flatMap((entry) => {
          const active = state.active.find(({ name }) => name === entry.name);
          if (!active || state.status !== "online") return [];
          return entry.cards.map((card) => (
            <article
              className="app-card"
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
      <section className="panel">
        <h1>{page.title}</h1>
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
    <section className="panel">
      <h1>Page not found</h1>
      <Link to="/">Back to overview</Link>
    </section>
  );
}
