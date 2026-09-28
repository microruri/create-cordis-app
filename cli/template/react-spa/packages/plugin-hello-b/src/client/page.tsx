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
    <section className="card bg-base-100 border border-base-300 shadow-sm p-6 md:p-8 max-w-4xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-base-content/60">
        {hello.data?.app ?? "Plugin"}
      </p>
      <h1 className="text-3xl font-semibold my-4">Hello B</h1>
      <p className="text-lg text-base-content/80 my-4">
        {hello.isPending ? "Loading greeting..." : hello.data?.message}
      </p>
      {hello.isError && (
        <p className="alert alert-error my-3" role="alert">
          Unable to load the greeting.{" "}
          <button className="btn btn-primary" onClick={() => void hello.refetch()}>
            Retry
          </button>
        </p>
      )}
      <form className="mt-6" onSubmit={submit}>
        <label htmlFor="name">Your name</label>
        <div className="flex flex-wrap gap-3 mt-2">
          <input
            className="input input-bordered flex-1 min-w-0"
            id="name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
            placeholder="Ada"
            autoComplete="given-name"
          />
          <button className="btn btn-primary" type="submit" disabled={greet.isPending}>
            {greet.isPending ? "Sending..." : "Say hello"}
          </button>
        </div>
      </form>
      <div className="min-h-12 mt-4" aria-live="polite">
        {greet.isError && (
          <p className="alert alert-error my-3" role="alert">
            {greet.error.message}
          </p>
        )}
        {greet.data && <p>{greet.data.message}</p>}
      </div>
    </section>
  );
}
