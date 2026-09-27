"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigation, useRouter } from "@acme/plugin-web/client";

export default function Controls() {
  const router = useRouter();
  const { pending } = useNavigation();
  const client = useQueryClient();
  const [text, setText] = useState("");
  const value = useQuery({
    queryKey: ["navigation-value"],
    queryFn: () =>
      fetch("/api/trpc/navigation-test/read")
        .then((r) => r.json())
        .then((r) => r.result.data as number),
  });
  const change = useMutation({
    mutationFn: () =>
      fetch("/api/trpc/navigation-test/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "null",
      }).then((r) => r.json()),
    onSuccess: () => client.invalidateQueries({ queryKey: ["navigation-value"] }),
  });
  return (
    <div>
      <p id="query-value">Query value: {value.data}</p>
      <p id="navigation-state">{pending ? "pending" : "idle"}</p>
      <input
        aria-label="Preserved input"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button onClick={() => router.refresh()}>Refresh page</button>
      <button onClick={() => router.push("/hello-a")}>Push hello</button>
      <button onClick={() => router.replace("/hello-a", { scroll: false })}>Replace hello</button>
      <button onClick={() => change.mutate()}>Change value</button>
      <Link href="/hello-a?default">Default link</Link>
      <Link href="/hello-a?disabled" prefetch={false}>
        No prefetch
      </Link>
      <Link href="/hello-a?focus" prefetch>
        Focus prefetch
      </Link>
      <Link href="/hello-a?hover" prefetch>
        Hover prefetch
      </Link>
      <a href="#bottom">Bottom</a>
      <div style={{ height: "150vh" }} />
      <p id="bottom">Bottom of page</p>
    </div>
  );
}
