import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LogoMark, Wordmark } from "@orgasport/ui";
import { getMessages } from "@/i18n";
import { SiteFooter } from "@/components/vitrine/SiteFooter";

// Empty placeholders until the legal texts are written (out of scope for now).
export function generateStaticParams() {
  return Object.keys(getMessages().legal.pages).map((slug) => ({ slug }));
}

type Params = Promise<{ slug: string }>;

async function LegalContent({ params }: { params: Params }) {
  const { slug } = await params;
  const m = getMessages().legal;
  const title = (m.pages as Record<string, string>)[slug];
  if (!title) notFound();
  return (
    <>
      <h1 className="display text-5xl">{title}</h1>
      <p className="text-ink-soft">{m.placeholder}</p>
    </>
  );
}

export default function LegalPage({ params }: { params: Params }) {
  return (
    <>
      <header className="mx-auto flex max-w-3xl items-center px-4 py-4">
        <Link href="/" className="flex items-center gap-2 text-ink">
          <LogoMark size={26} />
          <Wordmark className="text-xl" />
        </Link>
      </header>
      <main id="contenu" className="mx-auto grid max-w-3xl gap-4 px-4 py-10">
        <Suspense>
          <LegalContent params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
