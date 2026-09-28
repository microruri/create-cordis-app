"use client";
import { createContext, useContext, useSyncExternalStore } from "react";
import type { navigation } from "./navigation.ts";
import { idle } from "./navigation-state.ts";

export const NavigationContext = createContext<ReturnType<typeof navigation> | null>(null);
export const NavigationRevision = createContext(0);
const subscribe = () => () => {};
const snapshot = () => idle;
const unavailable = () => {
  throw new Error("The router is only available in the browser");
};
const serverRouter = {
  push: unavailable,
  replace: unavailable,
  refresh: unavailable,
  prefetch: async () => {},
};

export function useRouter(): Pick<
  ReturnType<typeof navigation>,
  "push" | "replace" | "refresh" | "prefetch"
> {
  return useContext(NavigationContext) ?? serverRouter;
}
export function useNavigation() {
  const router = useContext(NavigationContext);
  return useSyncExternalStore(
    router?.subscribe ?? subscribe,
    router?.getSnapshot ?? snapshot,
    snapshot,
  );
}
