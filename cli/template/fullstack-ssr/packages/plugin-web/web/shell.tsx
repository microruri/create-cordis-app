import type { ReactNode } from "react";
import "./style.css";
import type { RegisteredPage, WebState } from "../src/types.ts";
import { Link, NavigationContent } from "./link.tsx";

interface NavigationProps {
  web: WebState;
  pages: RegisteredPage[];
  pathname?: string;
}
function Navigation({ web, pages, pathname }: NavigationProps) {
  return pages
    .filter((page) => web.activePlugins.includes(page.plugin) && !page.path.includes("$"))
    .map((page) => (
      <li key={page.plugin + ":" + page.id}>
        <Link
          href={page.path}
          className={pathname === page.path ? "menu-active" : undefined}
          aria-current={pathname === page.path ? "page" : undefined}
        >
          {page.title}
        </Link>
      </li>
    ));
}
export function Shell({
  web,
  pages,
  pathname,
  children,
}: NavigationProps & { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-base-200 text-base-content">
      <header className="navbar flex-wrap bg-base-100 border-b border-base-300 px-6 gap-4 justify-between">
        <Link className="text-xl font-bold" href="/">
          {web.title}
        </Link>
        <span>Server-rendered React</span>
      </header>
      <div className="flex flex-col md:flex-row">
        <nav
          className="bg-base-100 border-b md:border-r border-base-300 p-4 md:w-56 shrink-0"
          aria-label="Main navigation"
        >
          <ul className="menu w-full gap-1 p-0">
            <li>
              <Link
                href="/"
                className={pathname === "/" ? "menu-active" : undefined}
                aria-current={pathname === "/" ? "page" : undefined}
              >
                Overview
              </Link>
            </li>
            <li className="menu-title">Plugins</li>
            <Navigation web={web} pages={pages} pathname={pathname} />
          </ul>
        </nav>
        <NavigationContent>{children}</NavigationContent>
      </div>
    </div>
  );
}
export function Overview({ web, pages }: NavigationProps) {
  return (
    <section className="card bg-base-100 border border-base-300 shadow-sm p-6 md:p-8 max-w-4xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-base-content/60">
        Cordis + React
      </p>
      <h1 className="text-3xl font-semibold my-4">{web.title}</h1>
      <p>Pages are provided by this app's active plugins and rendered on the server.</p>
      <ul className="menu">
        <Navigation web={web} pages={pages} />
      </ul>
    </section>
  );
}
export function ErrorPage({ notFound = false }: { notFound?: boolean }) {
  return (
    <section className="card bg-base-100 border border-base-300 shadow-sm p-6 md:p-8 max-w-4xl">
      <h1 className="text-3xl font-semibold my-4">
        {notFound ? "Page not found" : "Something went wrong"}
      </h1>
      <p>{notFound ? "This page is unavailable." : "Please try again."}</p>
      <Link href="/">Back to overview</Link>
    </section>
  );
}
