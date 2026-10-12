import { getMessages } from "@/i18n";
import { Note } from "@/components/ui/Section";

export default function NewTournamentPage() {
  const m = getMessages();
  return (
    <div className="grid gap-6">
      <h1 className="display text-5xl">{m.home.clubHome.create}</h1>
      <Note>{m.home.clubHome.createSoon}</Note>
    </div>
  );
}
