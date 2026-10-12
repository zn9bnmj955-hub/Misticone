import { connection } from "next/server";
import { fmt, getMessages } from "@/i18n";
import { formatTime } from "@/lib/format";
import { getForecast, weatherLink } from "@/lib/weather";
import type { TournamentDetail } from "@/app/(app)/concours/[code]/data";
import { WeatherIcon } from "./WeatherIcon";

/**
 * Forecast for the place and time of the tournament (MET Norway, cached one
 * hour). Out of range or unreachable: only the link to a weather site.
 */
/** MET Norway forecasts go about 9 days ahead (see lib/weather.ts). */
const HORIZON_MS = 9 * 86_400_000;

async function forecastFor(t: TournamentDetail) {
  await connection();
  const now = Date.now();
  const tooEarly = t.starts_at !== null && Date.parse(t.starts_at) - now > HORIZON_MS;
  return { forecast: tooEarly ? null : await getForecast(t.lat, t.lng, t.starts_at, now), tooEarly };
}

export async function WeatherTile({ t }: { t: TournamentDetail }) {
  const w = getMessages().detail.weather;
  const { forecast, tooEarly } = await forecastFor(t);
  const link = weatherLink(t.lat, t.lng, t.city);
  return (
    <div className="grid gap-3">
      {forecast ? (
        <div className="flex items-center gap-3">
          <span className="text-accent-ink">
            <WeatherIcon kind={forecast.kind} />
          </span>
          <div className="grid">
            <span className="text-lg font-bold">
              {w.kinds[forecast.kind]}
              {forecast.temperatureC !== null && <span className="tabular"> · {fmt(w.temperature, { value: forecast.temperatureC })}</span>}
            </span>
            <span className="text-sm text-ink-soft tabular">
              {[
                fmt(w.at, { time: formatTime(forecast.at) }),
                forecast.precipitationMm !== null && forecast.precipitationMm > 0
                  ? fmt(w.rain, { value: forecast.precipitationMm.toLocaleString("fr-FR") })
                  : null,
                forecast.windKmh !== null ? fmt(w.wind, { value: forecast.windKmh }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        </div>
      ) : (
        // Unreachable service: the link below is enough.
        tooEarly && <p className="text-sm text-ink-soft">{w.unavailable}</p>
      )}
      <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center font-bold text-accent-ink underline underline-offset-4">
        {w.more}
        <span className="sr-only"> {getMessages().detail.more.newTab}</span>
      </a>
      {forecast && <p className="text-xs text-ink-soft">{w.attribution}</p>}
    </div>
  );
}
