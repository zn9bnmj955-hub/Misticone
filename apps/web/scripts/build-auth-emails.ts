/**
 * Writes the HTML templates of the emails sent by Supabase Auth into
 * supabase/templates/, with the same layout as the other OrgaSport emails.
 * Run with `pnpm --filter @orgasport/web emails:auth` after changing the
 * texts (src/i18n/fr/authEmails.ts) or the colors (tokens.css).
 *
 * Local Supabase reads them through supabase/config.toml; in production they
 * are pasted in Supabase > Authentication > Emails (docs/DEPLOIEMENT.md).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderEmail } from "../src/lib/email/layout";
import { authEmails as m } from "../src/i18n/fr/authEmails";

// The layout only accepts web links: a placeholder is swapped for Supabase's variable.
const PLACEHOLDER = "https://confirmation.invalid/";
const out = join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/templates");
mkdirSync(out, { recursive: true });

const files = { magic_link: m.magicLink, confirmation: m.confirmation, recovery: m.recovery, email_change: m.emailChange };
for (const [file, t] of Object.entries(files)) {
  const { html } = renderEmail({
    brand: m.brand,
    title: t.title,
    preheader: t.preheader,
    blocks: [
      { kind: "paragraph", text: t.body },
      { kind: "button", label: t.button, url: PLACEHOLDER },
      { kind: "note", text: t.tip },
    ],
    footer: [...m.footer],
  });
  writeFileSync(join(out, `${file}.html`), html.replaceAll(PLACEHOLDER, "{{ .ConfirmationURL }}") + "\n");
  console.log(`supabase/templates/${file}.html — ${t.subject}`);
}
