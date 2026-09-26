import { useState, type SubmitEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Api } from "./index.ts";

export default function HelloPage({ api }: { api: Api }) {
  const [name, setName] = useState("");
  const hello = useQuery(api.hello.queryOptions(undefined, { trpc: { abortOnUnmount: true } }));
  const greet = useMutation(api.greet.mutationOptions());

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    greet.mutate({ name });
  }

  return (
    <section className="panel">
      <p className="eyebrow">{hello.data?.app ?? "Plugin"}</p>
      <h1>Hello A</h1>
      <p className="greeting">{hello.isPending ? "Loading greeting..." : hello.data?.message}</p>
      {hello.isError && (
        <p role="alert">
          Unable to load the greeting. <button onClick={() => void hello.refetch()}>Retry</button>
        </p>
      )}
      <form onSubmit={submit}>
        <label htmlFor="name">Your name</label>
        <div className="form-row">
          <input
            id="name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
            placeholder="Ada"
            autoComplete="given-name"
          />
          <button type="submit" disabled={greet.isPending}>
            {greet.isPending ? "Sending..." : "Say hello"}
          </button>
        </div>
      </form>
      <div className="result" aria-live="polite">
        {greet.isError && <p role="alert">{greet.error.message}</p>}
        {greet.data && <p>{greet.data.message}</p>}
      </div>
    </section>
  );
}
