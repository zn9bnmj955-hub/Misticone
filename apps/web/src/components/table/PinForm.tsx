"use client";
import { useState } from "react";
import Link from "next/link";
import { getMessages } from "@/i18n";
import { Btn } from "./ui";

export function PinForm({ code }: { code: string }) {
  const t = getMessages().table;
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto grid max-w-md gap-6 pt-6">
      <form
        className="grid gap-4 rounded-[var(--radius-lg)] border-2 border-ink bg-surface p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/t/${code}/pin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) }).catch(() => null);
          setBusy(false);
          if (res?.ok) window.location.reload();
          else setError(res?.status === 429 ? t.pinLimited : t.pinInvalid);
        }}
      >
        <h1 className="display text-4xl">{t.pinTitle}</h1>
        <p className="text-ink-soft">{t.pinText}</p>
        <label className="grid gap-1 font-bold" htmlFor="pin">
          {t.pinLabel}
        </label>
        <input
          id="pin"
          className="h-16 rounded-[var(--radius)] border-2 border-line bg-bg px-4 text-center text-4xl font-black tracking-[0.4em] tabular"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={8}
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        />
        {error && (
          <p role="alert" className="font-bold text-danger">
            {error}
          </p>
        )}
        <Btn tone="primary" type="submit" disabled={busy || pin.length < 4} className="h-14 text-lg">
          {t.pinSubmit}
        </Btn>
      </form>
      <p className="text-center text-ink-soft">
        {t.orLogin}{" "}
        <Link className="font-bold text-ink underline" href={`/connexion?next=${encodeURIComponent(`/c/${code}/table`)}`}>
          {t.login}
        </Link>
      </p>
    </div>
  );
}
