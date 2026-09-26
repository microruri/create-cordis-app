import { usePageContext } from "vike-react/usePageContext";

export default function ErrorPage() {
  const { is404 } = usePageContext();
  return (
    <section className="panel">
      <h1>{is404 ? "Page not found" : "Something went wrong"}</h1>
      <p>{is404 ? "This page is unavailable." : "Please try again."}</p>
      <a href="/">Back to overview</a>
    </section>
  );
}
