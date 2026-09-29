import type { ComponentType } from "react";
import type { QueryClient, QueryFilters } from "@tanstack/react-query";

export interface WebPage {
  path: string;
  title: string;
  component: () => Promise<{ default: ComponentType }>;
  load?: () => Promise<unknown>;
}
export interface WebPlugin {
  pages?: WebPage[];
  queryFilter?: QueryFilters;
}
export interface WebHost {
  queryClient: QueryClient;
  apiBase: string;
}
export interface PluginFactory {
  name: string;
  createPlugin: (host: WebHost) => WebPlugin;
}
