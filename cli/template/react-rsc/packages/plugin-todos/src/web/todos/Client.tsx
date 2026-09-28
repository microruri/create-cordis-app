"use client";
import { useQueryClient } from "@tanstack/react-query";
import { createPluginClient } from "@acme/plugin-rpc/client";
import type { Router } from "../../server/router.ts";

import Todos from "../Todos.tsx";
export default function Page() {
  const api = createPluginClient<Router>("/api", "todos", useQueryClient());
  return <Todos api={api} />;
}
