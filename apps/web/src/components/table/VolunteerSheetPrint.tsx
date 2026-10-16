"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { fmt, getMessages } from "@/i18n";
import { spacedPin, type VolunteerSheet } from "./volunteer-sheet";

/**
 * Prints the volunteer sheet on one page (A4, also fits A5/A6 scaled), from
 * this device only: the PIN is rendered locally and never sent anywhere.
 * Same mechanism as the backup printing (#print-root, html.printing).
 */
export function VolunteerSheetPrint({ sheet, onDone }: { sheet: VolunteerSheet; onDone: () => void }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("printing");
    const done = () => {
      root.classList.remove("printing");
      onDone();
    };
    window.addEventListener("afterprint", done, { once: true });
    // Wait for the QR image so it is on the printed page.
    const img = document.querySelector<HTMLImageElement>("#print-root img[data-qr]");
    let printed = false;
    const print = () => {
      if (printed) return;
      printed = true;
      window.print();
    };
    const id = setTimeout(() => (img && !img.complete ? img.addEventListener("load", print, { once: true }) : print()), 50);
    const fallback = setTimeout(print, 3000);
    return () => {
      clearTimeout(id);
      clearTimeout(fallback);
      window.removeEventListener("afterprint", done);
      root.classList.remove("printing");
    };
  }, [onDone]);
  return createPortal(<VolunteerSheetPage sheet={sheet} />, document.body);
}

export function VolunteerSheetPage({ sheet }: { sheet: VolunteerSheet }) {
  const t = getMessages().table.access.sheet;
  const tableUrl = `${typeof location === "undefined" ? "" : location.origin}${sheet.tablePath}`;
  return (
    <div
      id="print-root"
      data-volunteer-sheet
      style={{ fontFamily: "Arial, sans-serif", color: "var(--os-paper-ink)", background: "var(--os-paper)", padding: "12mm", textAlign: "center", breakInside: "avoid", pageBreakInside: "avoid" }}
    >
      <p style={{ fontSize: "14pt", fontWeight: 700, margin: 0 }}>{t.title}</p>
      <h1 style={{ fontSize: "22pt", margin: "2mm 0 1mm" }}>{sheet.tournamentName}</h1>
      <p style={{ fontSize: "12pt", margin: "0 0 6mm" }}>
        {sheet.code} · {fmt(t.for, { label: sheet.label })}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG from our own route, printed as is */}
      <img data-qr src={sheet.qrSrc} alt={t.scan} width={240} height={240} style={{ width: "65mm", height: "65mm", display: "block", margin: "0 auto" }} />
      <p style={{ fontSize: "11pt", margin: "2mm 0 0" }}>{t.scan}</p>
      <p style={{ fontSize: "10pt", margin: "1mm 0 6mm", wordBreak: "break-all" }}>{tableUrl}</p>
      <p style={{ fontSize: "12pt", fontWeight: 700, margin: 0 }}>{t.pin}</p>
      <p data-pin style={{ fontSize: "44pt", fontWeight: 900, letterSpacing: "2mm", margin: "0 0 6mm", border: "3px solid var(--os-paper-ink)", display: "inline-block", padding: "1mm 6mm" }}>
        {spacedPin(sheet.pin)}
      </p>
      <ol style={{ textAlign: "left", fontSize: "12pt", lineHeight: 1.4, margin: "0 auto 5mm", maxWidth: "150mm", paddingLeft: "8mm" }}>
        {t.steps.map((s) => (
          <li key={s} style={{ marginBottom: "2mm" }}>
            {s}
          </li>
        ))}
      </ol>
      <p style={{ fontSize: "9pt", margin: 0 }}>{t.keep}</p>
    </div>
  );
}
