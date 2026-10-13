import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/** Same look as TextField, for selects and text areas. */
export const fieldClass =
  "w-full rounded-[var(--radius)] border-2 border-line bg-surface px-4 text-base text-ink placeholder:text-ink-soft/70 focus:border-accent";

export function FieldShell({ id, label, hint, children, className }: { id: string; label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-desc`} className="text-sm text-ink-soft">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SelectField({ id, label, hint, className, children, ...props }: ComponentProps<"select"> & { id: string; label: string; hint?: string }) {
  return (
    <FieldShell id={id} label={label} hint={hint} className={className}>
      <select id={id} aria-describedby={hint ? `${id}-desc` : undefined} className={cn(fieldClass, "min-h-12")} {...props}>
        {children}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({ id, label, hint, className, ...props }: ComponentProps<"textarea"> & { id: string; label: string; hint?: string }) {
  return (
    <FieldShell id={id} label={label} hint={hint} className={className}>
      <textarea id={id} aria-describedby={hint ? `${id}-desc` : undefined} className={cn(fieldClass, "min-h-28 py-3")} {...props} />
    </FieldShell>
  );
}
