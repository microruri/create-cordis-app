"use client";
import { useContext, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { NavigationContext, useNavigation } from "./router-context.ts";
import { pageUrl } from "./navigation-state.ts";

export function Link({
  href,
  prefetch = false,
  replace = false,
  scroll = true,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  ...props
}: Omit<ComponentProps<"a">, "href"> & {
  href: string;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
}) {
  const router = useContext(NavigationContext);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = () => clearTimeout(timer.current);
  useEffect(() => cancel, [href, prefetch]);
  const eligible = () =>
    router &&
    (props.download == null || props.download === false) &&
    (!props.target || props.target === "_self");
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          !eligible() ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        if (!pageUrl(href, location.href)) return;
        event.preventDefault();
        cancel();
        router![replace ? "replace" : "push"](href, { scroll });
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        if (prefetch && eligible() && !event.defaultPrevented) {
          cancel();
          timer.current = setTimeout(() => {
            void router!.prefetch(href);
          }, 100);
        }
      }}
      onMouseLeave={(event) => {
        onMouseLeave?.(event);
        cancel();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (prefetch && eligible() && !event.defaultPrevented) {
          cancel();
          void router!.prefetch(href);
        }
      }}
    />
  );
}
export function NavigationContent({ children }: { children: ReactNode }) {
  const { pending } = useNavigation();
  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 inset-x-0 z-50 pointer-events-none"
      >
        {pending && (
          <>
            <progress
              aria-label="Loading page"
              className="progress progress-primary block w-full rounded-none h-1"
            />
            <span className="sr-only">Loading page...</span>
          </>
        )}
      </div>
      <main aria-busy={pending} className="flex-1 min-w-0 p-4 md:p-8">
        {children}
      </main>
    </>
  );
}
