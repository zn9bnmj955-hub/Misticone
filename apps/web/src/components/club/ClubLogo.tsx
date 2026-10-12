import { cn } from "@/components/ui/cn";

/** Club logo, or its initial on the accent color when there is none. */
export function ClubLogo({ url, name, alt, size = "md" }: { url: string | null; name: string; alt: string; size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-20 text-4xl" : "size-14 text-2xl";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL, no image optimizer needed
    return <img src={url} alt={alt} className={cn("shrink-0 rounded-[var(--radius-lg)] border border-line bg-surface object-contain", box)} />;
  }
  return (
    <span aria-hidden="true" className={cn("display grid shrink-0 place-items-center rounded-[var(--radius-lg)] bg-accent text-on-accent", box)}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
