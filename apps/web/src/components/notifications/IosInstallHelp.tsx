import type { Messages } from "@/i18n";

type Texts = Pick<Messages["notifications"], "iosTitle" | "iosText" | "iosStep" | "iosMenu" | "iosIllustration">;

/**
 * iPhone / iPad in Safari, site not on the home screen: push cannot work yet.
 * One step, one picture: Share button, then « Sur l'écran d'accueil ».
 */
export function IosInstallHelp({ texts }: { texts: Texts }) {
  return (
    <div className="grid gap-3 rounded-[var(--radius)] border border-line bg-surface-2 p-4" role="note">
      <p className="font-bold">{texts.iosTitle}</p>
      <p className="text-ink-soft">{texts.iosText}</p>
      <svg viewBox="0 0 260 96" className="h-auto w-full max-w-xs" role="img" aria-label={texts.iosIllustration}>
        {/* Safari bottom bar with the Share button highlighted */}
        <rect x="2" y="44" width="112" height="44" rx="10" className="fill-surface stroke-line" strokeWidth="2" />
        <path d="M18 66h10M22 62l-4 4 4 4M92 66h10M98 62l4 4-4 4" className="stroke-ink-soft" strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="58" cy="66" r="17" className="fill-accent-soft stroke-accent" strokeWidth="2" />
        <path d="M58 70V56M53.5 60.5 58 56l4.5 4.5M54 63h-3v12h14V63h-3" className="stroke-accent-ink" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="58" y="30" textAnchor="middle" className="fill-accent-ink" fontSize="22" fontWeight="800">1</text>
        {/* arrow */}
        <path d="M122 66h18m-6-6 6 6-6 6" className="stroke-ink-soft" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* share sheet row */}
        <rect x="148" y="44" width="110" height="44" rx="10" className="fill-surface stroke-accent" strokeWidth="2" />
        <rect x="158" y="56" width="20" height="20" rx="5" className="stroke-ink" strokeWidth="2" fill="none" />
        <path d="M168 61v10M163 66h10" className="stroke-ink" strokeWidth="2" strokeLinecap="round" />
        <text x="184" y="70" className="fill-ink" fontSize="10.5" fontWeight="700">{texts.iosMenu}</text>
        <text x="203" y="30" textAnchor="middle" className="fill-accent-ink" fontSize="22" fontWeight="800">2</text>
      </svg>
      <p className="font-bold">{texts.iosStep}</p>
    </div>
  );
}
