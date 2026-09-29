"use client";
import { useContext, useEffect, useRef, type ComponentProps } from "react";
import { NavigationContext } from "./router-context.ts";
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
