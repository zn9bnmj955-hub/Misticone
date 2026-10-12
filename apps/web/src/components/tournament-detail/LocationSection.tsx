import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import type { TournamentDetail } from "@/app/(app)/concours/[code]/data";
import { CopyButton } from "./CopyButton";
import { LazyMap } from "./LazyMap";
import { directionsLinks, placeText } from "./links";

/** Address (copyable), mini map and one-tap directions in the person's GPS app. */
export function LocationSection({ t }: { t: TournamentDetail }) {
  const m = getMessages();
  const l = m.detail.location;
  const more = m.detail.more;
  const address = placeText(t);
  const directions = directionsLinks(t);
  const hasPoint = t.lat != null && t.lng != null;

  return (
    <Section title={l.title} id="acces">
      <Card className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <address className="grid gap-0.5 not-italic">
            <span className="eyebrow">{more.address}</span>
            <span className="text-lg font-bold">{address || l.noAddress}</span>
          </address>
          {address && <CopyButton text={address} label={more.copy} copiedLabel={more.copied} failedLabel={more.copyFailed} />}
        </div>
        {hasPoint && <LazyMap lat={t.lat!} lng={t.lng!} label={fmt(l.mapLabel, { name: t.name })} />}
        {directions && (
          <div className="grid gap-2">
            <p className="eyebrow">{l.directions}</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  [directions.google, l.google],
                  [directions.waze, l.waze],
                  [directions.apple, l.apple],
                ] as const
              ).map(([href, label]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={buttonClass("outline", "md", "px-2 text-sm sm:text-base")}>
                  <Icon name="arrowRight" size={18} className="hidden sm:block" />
                  {label}
                  <span className="sr-only"> {more.newTab}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </Card>
    </Section>
  );
}
