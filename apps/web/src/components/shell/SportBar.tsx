import { enabledSports } from "@orgasport/sports";
import { getMessages } from "@/i18n";
import { SportSelector } from "./SportSelector";

/** Sport chips shown at the top of the home feed and the catalog. */
export function SportBar() {
  const m = getMessages();
  const sports = enabledSports().map((s) => ({ slug: s.slug, name: s.name, icon: s.icon, accentToken: s.accentToken }));
  return <SportSelector sports={sports} allLabel={m.common.allSports} label={m.nav.sportFilter} />;
}
