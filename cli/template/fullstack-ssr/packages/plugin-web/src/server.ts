export type { ServerPageProps, WebPage } from "./types.ts";

export function redirect({ to, statusCode = 302 }: { to: string; statusCode?: number }) {
  if (!to.startsWith("/") || to.startsWith("//") || /[\\\r\n]/.test(to))
    throw new Error("Redirects must use an app-relative URL");
  if (![301, 302, 303, 307, 308].includes(statusCode)) throw new Error("Invalid redirect status");
  return new Response(null, { status: statusCode, headers: { Location: to } });
}
export function notFound() {
  return new Response(null, { status: 404 });
}
