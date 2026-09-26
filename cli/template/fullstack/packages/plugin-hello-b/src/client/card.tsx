import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Api } from "./index.ts";

export default function HelloCard({ api }: { api: Api }) {
  const hello = useQuery(api.hello.queryOptions(undefined, { trpc: { abortOnUnmount: true } }));
  const [count, setCount] = useState(0);
  return (
    <>
      <h2>Hello B</h2>
      <p>{hello.data?.message ?? (hello.isError ? hello.error.message : "Loading...")}</p>
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
    </>
  );
}
