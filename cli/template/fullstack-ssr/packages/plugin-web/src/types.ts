import type { Context } from "cordis";
import type {} from "@acme/plugin-rpc";
import type {} from "vike-react/config";

export interface WebState {
  title: string;
  activePlugins: string[];
}
declare global {
  namespace Vike {
    interface Config {
      cordisPlugin?: string;
    }
    interface PageContext {
      web: WebState;
    }
    interface PageContextServer {
      cordis: Context;
      request: Request;
    }
  }
}
