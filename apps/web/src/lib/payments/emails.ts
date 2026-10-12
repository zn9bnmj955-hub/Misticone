import { fmt, getMessages } from "@/i18n";
import { formatEuros, formatTime } from "@/lib/format";
import type { EmailMessage } from "@/lib/email";
import { renderEmail, type EmailBlock } from "@/lib/email/layout";

/**
 * Emails sent when a tournament goes online: the organizer's confirmation
 * (links, volunteer PINs — the only place they ever appear — and a simple
 * receipt) and one invitation per co-organizer. Pure: easy to test and to
 * preview.
 */
export type PublishedTournament = {
  tournamentId: string;
  name: string;
  code: string;
  startsAt: string;
  address: string;
  postcode: string;
  city: string;
  organizer: { name: string; email: string };
  coOrganizers: string[];
  pins: { label: string; pin: string }[];
  receipt: {
    provider: "stripe" | "simulation" | "free";
    baseCents: number;
    discountCents: number;
    amountCents: number;
    promoCode: string | null;
    paidAt: string;
    reference: string;
    receiptUrl: string | null;
    invoiceUrl: string | null;
  };
  siteUrl: string;
};

const TZ = "Europe/Paris";

/** "samedi 24 octobre 2026" */
export function longDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(new Date(iso));
}

const links = (t: PublishedTournament) => {
  const base = `${t.siteUrl.replace(/\/$/, "")}/c/${t.code}`;
  return { page: base, qr: `${base}/qr.svg`, poster: `${base}/affiche`, table: `${base}/table` };
};

const place = (t: PublishedTournament) => [t.address, [t.postcode, t.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/** Organizer emails come from a no-reply address; co-organizer emails are answered by the organizer. */
function footer(replyTo?: string): string[] {
  const m = getMessages().payment.email;
  return [m.footer, replyTo ? fmt(m.replyToOrganizer, { person: replyTo }) : m.automatic];
}

export function organizerEmail(t: PublishedTournament): EmailMessage {
  const m = getMessages();
  const e = m.payment.email.organizer;
  const l = links(t);
  const r = t.receipt;
  const blocks: EmailBlock[] = [
    { kind: "paragraph", text: fmt(e.intro, { person: t.organizer.name, name: t.name }) },
    {
      kind: "facts",
      items: [
        { label: e.when, value: fmt(e.whenValue, { date: longDate(t.startsAt), time: formatTime(t.startsAt) }) },
        { label: e.where, value: place(t) },
      ],
    },
    { kind: "heading", text: e.linksTitle },
    {
      kind: "links",
      items: [
        { label: e.shortLink, url: l.page },
        { label: e.qr, url: l.qr },
        { label: e.poster, url: l.poster },
        { label: e.scoringTable, url: l.table },
      ],
    },
    { kind: "button", label: e.openTable, url: l.table },
    { kind: "heading", text: e.pinsTitle },
  ];
  if (t.pins.length > 0) {
    blocks.push(
      { kind: "paragraph", text: fmt(e.pinsIntro, { url: l.table }) },
      { kind: "codes", items: t.pins.map((p) => ({ label: p.label, value: p.pin })) },
      { kind: "note", text: e.pinsWarning },
    );
  } else {
    blocks.push({ kind: "paragraph", text: e.noPins });
  }
  if (t.coOrganizers.length > 0) blocks.push({ kind: "paragraph", text: fmt(e.coOrganizers, { emails: t.coOrganizers.join(", ") }) });

  blocks.push({ kind: "heading", text: e.receiptTitle });
  const facts = [{ label: e.receiptPrice, value: formatEuros(r.baseCents) }];
  if (r.discountCents > 0) {
    facts.push({
      label: r.promoCode ? fmt(e.receiptDiscountCode, { code: r.promoCode }) : e.receiptDiscount,
      value: `− ${formatEuros(r.discountCents)}`,
    });
  }
  facts.push(
    { label: e.receiptAmount, value: formatEuros(r.amountCents) },
    { label: e.receiptDate, value: `${longDate(r.paidAt)}, ${formatTime(r.paidAt)}` },
    { label: e.receiptMethod, value: m.payment.providers[r.provider] },
    { label: e.receiptReference, value: r.reference },
  );
  blocks.push({ kind: "facts", items: facts });
  if (r.provider === "stripe") {
    blocks.push({ kind: "paragraph", text: e.receiptStripe });
    const docs = [
      ...(r.receiptUrl ? [{ label: e.receiptLink, url: r.receiptUrl }] : []),
      ...(r.invoiceUrl ? [{ label: e.invoiceLink, url: r.invoiceUrl }] : []),
    ];
    if (docs.length > 0) blocks.push({ kind: "links", items: docs });
  } else {
    blocks.push({ kind: "note", text: r.provider === "free" ? e.receiptFree : e.receiptTest });
  }
  blocks.push({ kind: "links", items: [{ label: e.manage, url: `${t.siteUrl.replace(/\/$/, "")}/club/concours/${t.tournamentId}` }] });

  const { html, text } = renderEmail({ brand: m.meta.title, title: e.title, preheader: e.preheader, blocks, footer: footer() });
  return { to: t.organizer.email, subject: fmt(e.subject, { name: t.name }), text, html };
}

export function coOrganizerEmail(t: PublishedTournament, email: string): EmailMessage {
  const m = getMessages();
  const e = m.payment.email.coOrganizer;
  const o = m.payment.email.organizer;
  const l = links(t);
  const signup = `${t.siteUrl.replace(/\/$/, "")}/connexion?mode=signup&next=${encodeURIComponent(`/c/${t.code}/table`)}`;
  const blocks: EmailBlock[] = [
    { kind: "paragraph", text: fmt(e.intro, { person: t.organizer.name, name: t.name }) },
    {
      kind: "facts",
      items: [
        { label: o.when, value: fmt(o.whenValue, { date: longDate(t.startsAt), time: formatTime(t.startsAt) }) },
        { label: o.where, value: place(t) },
      ],
    },
    { kind: "paragraph", text: fmt(e.howTo, { email }) },
    { kind: "button", label: e.openTable, url: l.table },
    { kind: "note", text: e.noAccount },
    { kind: "links", items: [{ label: e.createAccount, url: signup }, { label: e.publicPage, url: l.page }] },
  ];
  const { html, text } = renderEmail({ brand: m.meta.title, title: e.title, preheader: e.preheader, blocks, footer: footer(t.organizer.name) });
  return { to: email, subject: fmt(e.subject, { name: t.name }), text, html, replyTo: t.organizer.email };
}
