"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore, useTransition, type ReactNode } from "react";

const noop = () => () => {};

/** True once hydrated (false during the server render), without an effect. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/**
 * Plain GET form (works without JavaScript). With JavaScript, every change
 * is applied right away through a soft navigation, so the « Afficher » button
 * is hidden and the page does not reload.
 *
 * The fields are uncontrolled (`defaultValue` from the URL): they are
 * re-created whenever the filters change (`signature`), also when a filter
 * chip removed one, and the focused field gets its focus back.
 */
export function FilterForm({
  action,
  label,
  updating,
  signature,
  className,
  children,
}: {
  action: string;
  label: string;
  updating: string;
  signature: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const focused = useRef<string | null>(null);
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const name = focused.current;
    focused.current = null;
    const el = name ? form.current?.elements.namedItem(name) : null;
    if (el instanceof HTMLElement) el.focus();
  }, [signature]);

  function apply() {
    if (!form.current) return;
    focused.current = document.activeElement?.getAttribute("name") ?? null;
    const q = new URLSearchParams();
    for (const [k, v] of new FormData(form.current)) if (typeof v === "string" && v) q.set(k, v);
    const s = q.toString();
    startTransition(() => router.replace(s ? `${action}?${s}` : action, { scroll: false }));
  }

  return (
    <form
      ref={form}
      method="get"
      action={action}
      aria-label={label}
      aria-busy={pending || undefined}
      data-auto={hydrated || undefined}
      className={`group/filters transition-opacity aria-busy:opacity-60 ${className ?? ""}`}
      onChange={apply}
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div key={signature} className="contents">
        {children}
      </div>
      <p role="status" className="sr-only">
        {pending ? updating : ""}
      </p>
    </form>
  );
}
