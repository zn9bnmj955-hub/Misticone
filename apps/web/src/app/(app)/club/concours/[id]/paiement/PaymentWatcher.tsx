"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMessages } from "@/i18n";

const POLL_MS = 3_000;
const SLOW_AFTER_MS = 60_000;

/**
 * Waits for the webhook: asks every 3 s whether the payment changed, then
 * re-renders the page on the server. It only reads: publishing is the
 * webhook's job, never the browser's.
 */
export function PaymentWatcher({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/payments/${paymentId}`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { status: string; published: boolean };
          if (body.published || body.status !== "pending") {
            router.refresh();
            return;
          }
        }
      } catch {
        // Offline for a moment: try again on the next tick.
      }
      if (stopped) return;
      if (Date.now() - started > SLOW_AFTER_MS) setSlow(true);
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [paymentId, router]);
  if (!slow) return null;
  return <p className="text-ink-soft">{getMessages().payment.result.pendingSlow}</p>;
}
