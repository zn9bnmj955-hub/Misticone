import { getMessages } from "@/i18n";
import { html, type SafeHtml } from "./html";

/** Legal links shown at the bottom of every public tournament page (a few dozen bytes, no JS). */
export function legalLinks(): SafeHtml {
  const p = getMessages().legal.pages;
  return html`<a href="/legal/mentions-legales">${p["mentions-legales"]}</a>
    <a href="/legal/confidentialite">${p.confidentialite}</a>`;
}
