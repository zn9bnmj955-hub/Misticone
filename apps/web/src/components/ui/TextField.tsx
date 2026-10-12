import type { ComponentProps } from "react";
import { cn } from "./cn";

export function TextField({
  label,
  hint,
  error,
  id,
  className,
  ...props
}: ComponentProps<"input"> & { label: string; hint?: string; error?: string; id: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-desc` : undefined}
        className="min-h-12 w-full rounded-[var(--radius)] border-2 border-line bg-surface px-4 text-base text-ink placeholder:text-ink-soft/70 focus:border-accent focus:outline-none aria-[invalid]:border-danger"
        {...props}
      />
      {(hint || error) && (
        <p id={`${id}-desc`} className={cn("text-sm", error ? "text-danger" : "text-ink-soft")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
