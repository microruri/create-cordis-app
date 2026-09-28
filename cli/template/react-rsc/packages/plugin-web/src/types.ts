import type { Context } from "cordis";
import type { ReactNode } from "react";
import type {} from "@acme/plugin-rpc";

export interface WebState {
  title: string;
  activePlugins: string[];
}
export interface ServerPageProps {
  cordis: Context;
  request: Request;
  url: URL;
  params: Record<string, string>;
}
export interface PageModule {
  default: (props: ServerPageProps) => ReactNode | Promise<ReactNode>;
  beforeRender?: (props: ServerPageProps) => void | Promise<void>;
}
export interface WebPage {
  id: string;
  path: string;
  title: string;
  component: () => Promise<PageModule>;
}
export interface RegisteredPage extends WebPage {
  plugin: string;
}
export interface RenderOptions {
  cordis: Context;
  request: Request;
  web: WebState;
}
export interface ServerEntry {
  validate: () => void;
  render: (options: RenderOptions) => Promise<Response>;
}
export interface RscPayload {
  root: ReactNode;
}
