import type { ReactNode } from "react";
import { getMessages } from "@/i18n";
import { cn } from "@/components/ui/cn";

/** Text of an error code returned by an /admin/assistant action. */
export function errorText(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const errors = getMessages().adminAssistant.errors;
  return code in errors ? errors[code as keyof typeof errors] : errors.server;
}

/** Result line under a form, announced to screen readers. */
export function ResultLine({ ok, children }: { ok: boolean | undefined; children: ReactNode }) {
  return (
    <p role="status" aria-live="polite" className={cn("min-h-6 text-sm font-bold", ok === false ? "text-danger" : "text-success")}>
      {children}
    </p>
  );
}
