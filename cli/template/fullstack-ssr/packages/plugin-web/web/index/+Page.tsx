import { usePageContext } from "vike-react/usePageContext";
import { navigation } from "../navigation.ts";

export default function Overview() {
  const context = usePageContext();
  return (
    <section className="panel">
      <p className="eyebrow">Cordis + Vike</p>
      <h1>{context.web.title}</h1>
      <p>Pages are provided by this app's active plugins and rendered on the server.</p>
      <ul>
        {navigation(context).map((page) => (
          <li key={page.href}>
            <a href={page.href}>{page.title}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
