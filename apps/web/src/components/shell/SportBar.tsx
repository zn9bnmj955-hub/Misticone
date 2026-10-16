import { enabledSports } from "@orgasport/sports";
import { getMessages } from "@/i18n";
import { SportSelector } from "./SportSelector";

/** Sport chips shown at the top of the home feed and the catalog. */
export function SportBar() {
  const m = getMessages();
  // A single sport offered (pétanque only): there is nothing to choose.
  if (enabledSports().length < 2) return null;
  const sports = enabledSports().map((s) => ({ slug: s.slug, name: s.name, icon: s.icon, accentToken: s.accentToken }));
  return <SportSelector sports={sports} allLabel={m.common.allSports} label={m.nav.sportFilter} />;
}
