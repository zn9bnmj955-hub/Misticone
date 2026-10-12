import type { ReactNode } from "react";

export function Section({ title, action, children, id }: { title: string; action?: ReactNode; children: ReactNode; id?: string }) {
  const headingId = id ?? `s-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <div className="flex items-end justify-between gap-3">
        <h2 id={headingId} className="display text-3xl">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-[var(--radius)] border border-dashed border-line px-4 py-3 text-sm text-ink-soft">{children}</p>;
}

export function Skeleton({ className = "h-32" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-[var(--radius-lg)] bg-surface-2 ${className}`} />;
}
