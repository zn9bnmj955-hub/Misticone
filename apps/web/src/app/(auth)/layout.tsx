import Link from "next/link";
import { LogoMark, Wordmark } from "@orgasport/ui";

/** Focused layout without navigation, for sign-in and onboarding. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid min-h-dvh max-w-lg grid-rows-[auto_1fr] px-4">
      <header className="flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-2 text-ink">
          <LogoMark size={26} />
          <Wordmark className="text-xl" />
        </Link>
      </header>
      <main id="contenu" className="pb-10">
        {children}
      </main>
    </div>
  );
}
