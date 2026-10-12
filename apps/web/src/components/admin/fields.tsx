import type { ComponentProps, ReactNode } from "react";
import { getMessages } from "@/i18n";
import { cn } from "@/components/ui/cn";

/** Form pieces of the admin forms that TextField does not cover (select, checkbox, messages). */

export function SelectField({
  label,
  hint,
  error,
  id,
  children,
  className,
  ...props
}: ComponentProps<"select"> & { label: string; hint?: string; error?: string; id: string; children: ReactNode }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-desc` : undefined}
        className="min-h-12 w-full rounded-[var(--radius)] border-2 border-line bg-surface px-4 text-base text-ink focus:border-accent focus:outline-none aria-[invalid]:border-danger"
        {...props}
      >
        {children}
      </select>
      {(hint || error) && (
        <p id={`${id}-desc`} className={cn("text-sm", error ? "text-danger" : "text-ink-soft")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function CheckField({ label, id, className, ...props }: ComponentProps<"input"> & { label: string; id: string }) {
  return (
    <label htmlFor={id} className={cn("flex min-h-12 cursor-pointer items-center gap-3 font-bold", className)}>
      <input id={id} type="checkbox" className="size-5 shrink-0 accent-accent" {...props} />
      {label}
    </label>
  );
}

/** Text of an error code returned by an admin action. */
export function errorText(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const errors = getMessages().admin.errors;
  return code in errors ? errors[code as keyof typeof errors] : errors.server;
}

/** Result line under a form, announced to screen readers. */
export function FormResult({ state }: { state: { ok: boolean; error?: string } | null }) {
  const t = getMessages().admin;
  return (
    <p role="status" aria-live="polite" className={cn("min-h-6 text-sm font-bold", state?.ok === false ? "text-danger" : "text-success")}>
      {state?.ok ? t.saved : state ? errorText(state.error) : null}
    </p>
  );
}

/** "Modifier" disclosure around an edit form: no JavaScript needed to open it. */
export function Disclosure({ summary, children, open }: { summary: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="group grid gap-3" open={open}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 font-bold text-accent-ink [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}
