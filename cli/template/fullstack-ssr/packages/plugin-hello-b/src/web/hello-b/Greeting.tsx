"use client";
import { useState, type SubmitEvent } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { createPluginClient } from "@acme/plugin-rpc/client";
import type { Router } from "../../server/router.ts";

export default function Greeting() {
  const queryClient = useQueryClient();
  const api = createPluginClient<Router>("/api", "hello-b", queryClient);
  const greet = useMutation(api.greet.mutationOptions());
  const [name, setName] = useState("");
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    greet.mutate({ name });
  }
  return (
    <>
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
    </>
  );
}
