import { describe, expect, it } from "vitest";
import { coOrganizerEmail, organizerEmail, type PublishedTournament } from "./emails";

const tournament: PublishedTournament = {
  tournamentId: "4dbbf947-2117-4814-ba42-262ae4698cdd",
  name: "Concours <de la> Toussaint",
  code: "7KQ2",
  startsAt: "2026-10-31T13:30:00.000Z",
  address: "Boulodrome des Platanes",
  postcode: "13100",
  city: "Aix-en-Provence",
  organizer: { name: "Marie", email: "marie@example.fr" },
  coOrganizers: ["paul@example.fr"],
  pins: [
    { label: "Bénévole 1", pin: "504312" },
    { label: "Bénévole 2", pin: "270918" },
  ],
  receipt: {
    provider: "stripe",
    baseCents: 2900,
    discountCents: 1450,
    amountCents: 1450,
    promoCode: "CLUB50",
    paidAt: "2026-10-12T10:00:00.000Z",
    reference: "pi_123",
    receiptUrl: "https://pay.stripe.com/receipts/abc",
    invoiceUrl: null,
  },
  siteUrl: "https://orgasport.fr",
};

describe("organizerEmail", () => {
  const email = organizerEmail(tournament);

  it("goes to the organizer with every link of the tournament", () => {
    expect(email.to).toBe("marie@example.fr");
    expect(email.subject).toContain("Concours <de la> Toussaint");
    for (const path of ["/c/7KQ2", "/c/7KQ2/qr.svg", "/c/7KQ2/affiche", "/c/7KQ2/table"]) {
      expect(email.text).toContain(`https://orgasport.fr${path}`);
      expect(email.html).toContain(`https://orgasport.fr${path}`);
    }
  });

  it("is the place where the PIN codes are given", () => {
    for (const pin of ["504312", "270918"]) {
      expect(email.text).toContain(pin);
      expect(email.html).toContain(pin);
    }
  });

  it("contains a receipt with the discount", () => {
    expect(email.text).toContain("CLUB50");
    expect(email.text).toContain("pi_123");
    expect(email.text).toContain("https://pay.stripe.com/receipts/abc");
    expect(email.text).toMatch(/14,50\s€/);
    expect(email.text).toContain("31 octobre 2026");
    expect(email.text).toContain("14 h 30");
  });

  it("escapes what the club typed", () => {
    expect(email.html).not.toContain("<de la>");
    expect(email.html).toContain("&lt;de la&gt;");
  });

  it("says so when no PIN was asked", () => {
    const none = organizerEmail({ ...tournament, pins: [], receipt: { ...tournament.receipt, provider: "simulation" } });
    expect(none.text).not.toContain("504312");
    expect(none.text).toContain("aucun argent");
  });
});

describe("coOrganizerEmail", () => {
  it("invites to the scoring table with the same address", () => {
    const email = coOrganizerEmail(tournament, "paul@example.fr");
    expect(email.to).toBe("paul@example.fr");
    expect(email.replyTo).toBe("marie@example.fr");
    expect(email.text).toContain("https://orgasport.fr/c/7KQ2/table");
    expect(email.text).toContain("paul@example.fr");
    expect(email.text).toContain(`/connexion?mode=signup&next=${encodeURIComponent("/c/7KQ2/table")}`);
    expect(email.text).not.toContain("504312");
    // Replies go to the organizer: the footer must not say "do not reply".
    expect(email.text).not.toContain("ne pas y répondre");
    expect(email.text).toContain(tournament.organizer.name);
  });
});
