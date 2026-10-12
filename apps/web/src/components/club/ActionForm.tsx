"use client";
import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import type { ActionState } from "./action-state";

/**
 * Form bound to a club-space server action: optional confirmation, fields
 * disabled while saving, and the result message read aloud (role status /
 * alert). Works without JavaScript too (plain POST to the action).
 *
 * Submitting goes through onSubmit so React does not reset the fields
 * automatically: on an error the person keeps what they typed. Creation
 * forms ask for `resetOnSuccess`.
 */
export function ActionForm({
  action,
  children,
  fields,
  confirm,
  resetOnSuccess = false,
  className,
  statusClassName,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  /** Hidden fields (ids…). */
  fields?: Record<string, string>;
  /** Question asked before submitting (destructive actions). */
  confirm?: string;
  resetOnSuccess?: boolean;
  className?: string;
  statusClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      aria-busy={pending || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        const data = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(data));
      }}
    >
      {fields && Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state && (
        <div role={state.ok ? "status" : "alert"} className={cn("text-sm font-semibold", state.ok ? "text-success" : "text-danger", statusClassName)}>
          <p>{state.ok ? state.message : state.error}</p>
          {state.ok && state.link && (
            <p className="mt-1 break-all rounded-[var(--radius)] bg-surface-2 px-3 py-2 font-mono text-xs text-ink select-all">{state.link}</p>
          )}
        </div>
      )}
    </form>
  );
}
