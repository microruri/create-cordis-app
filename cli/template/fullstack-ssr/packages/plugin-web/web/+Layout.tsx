import type { ReactNode } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { navigation } from "./navigation.ts";
import "./style.css";

export default function Layout({ children }: { children: ReactNode }) {
  const context = usePageContext();
  return (
    <div className="layout">
      <header>
        <a className="brand" href="/">
          {context.web.title}
        </a>
        <span>Server-rendered React</span>
      </header>
      <div className="workspace">
        <nav aria-label="Main navigation">
          <a href="/">Overview</a>
          <p className="eyebrow">Plugins</p>
          {navigation(context).map((page) => (
            <a
              key={page.href}
              href={page.href}
              aria-current={context.urlPathname === page.href ? "page" : undefined}
            >
              {page.title}
            </a>
          ))}
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
