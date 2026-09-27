import { useState, type SubmitEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { createPluginClient } from "@acme/plugin-rpc/client";
import type { Router } from "../server/router.ts";

type Api = ReturnType<typeof createPluginClient<Router>>;
type Todo = inferRouterOutputs<Router>["list"][number];

function TodoRow({ todo, api, refresh }: { todo: Todo; api: Api; refresh: () => Promise<void> }) {
  const [title, setTitle] = useState(todo.title);
  const update = useMutation(api.update.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(api.delete.mutationOptions({ onSuccess: refresh }));
  const busy = update.isPending || remove.isPending;
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    update.mutate({ id: todo.id, title });
  }
  return (
    <li className="border border-base-300 rounded-box p-4 bg-base-100">
      <form className="flex flex-wrap items-center gap-3" onSubmit={submit}>
        <input
          type="checkbox"
          className="checkbox checkbox-primary"
          aria-label={"Complete " + todo.title}
          checked={todo.completed}
          disabled={busy}
          onChange={(event) => update.mutate({ id: todo.id, completed: event.target.checked })}
        />
        <input
          className={
            "input input-bordered flex-1 min-w-32 " +
            (todo.completed ? "line-through opacity-60" : "")
          }
          aria-label="Todo title"
          value={title}
          maxLength={200}
          required
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button
          className="btn btn-sm"
          type="submit"
          disabled={busy || !title.trim() || title === todo.title}
        >
          Save
        </button>
        <button
          className="btn btn-sm btn-outline btn-error"
          type="button"
          disabled={busy}
          onClick={() => remove.mutate({ id: todo.id })}
        >
          Delete
        </button>
      </form>
      {(update.error || remove.error) && (
        <p role="alert" className="text-error mt-2">
          {(update.error ?? remove.error)?.message}
        </p>
      )}
    </li>
  );
}

export default function Todos({ api }: { api: Api }) {
  const client = useQueryClient();
  const list = useQuery(
    api.list.queryOptions(undefined, {
      staleTime: 30000,
      trpc: { abortOnUnmount: true },
    }),
  );
  const [title, setTitle] = useState("");
  const refresh = () => client.invalidateQueries(api.list.queryFilter());
  const create = useMutation(
    api.create.mutationOptions({
      onSuccess: async () => {
        setTitle("");
        await refresh();
      },
    }),
  );
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate({ title });
  }
  return (
    <div>
      <form className="flex flex-wrap gap-3 my-6" onSubmit={submit}>
        <label className="sr-only" htmlFor="new-todo">
          New todo
        </label>
        <input
          id="new-todo"
          className="input input-bordered flex-1 min-w-40"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What needs doing?"
          maxLength={200}
          required
          disabled={create.isPending}
        />
        <button className="btn btn-primary" disabled={create.isPending || !title.trim()}>
          {create.isPending ? "Adding..." : "Add todo"}
        </button>
      </form>
      {create.error && (
        <p className="alert alert-error mb-4" role="alert">
          {create.error.message}
        </p>
      )}
      {list.isPending && <p role="status">Loading todos...</p>}
      {list.isError && (
        <div className="alert alert-error" role="alert">
          <span>Unable to load todos.</span>
          <button className="btn btn-sm" onClick={() => void list.refetch()}>
            Retry
          </button>
        </div>
      )}
      {list.isSuccess && !list.data.length && (
        <p role="status" className="text-base-content/60">
          No todos yet. Add your first one above.
        </p>
      )}
      <ul className="space-y-3">
        {list.data?.map((todo) => (
          <TodoRow key={todo.id + ":" + todo.title} todo={todo} api={api} refresh={refresh} />
        ))}
      </ul>
    </div>
  );
}
