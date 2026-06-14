import { toZonedTime } from "date-fns-tz";

export type BusinessHour = {
  day_of_week: number;
  opens_at: string;
  closes_at: string;
};

function timeToSeconds(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
}

function effectiveClose(t: string): number {
  const secs = timeToSeconds(t);
  return secs === 0 ? 86400 : secs;
}

export function computeIsOpen(
  hours: BusinessHour[],
  timezone: string,
  now: Date = new Date(),
): boolean {
  const zoned = toZonedTime(now, timezone);
  const dow = zoned.getDay();
  const secondsNow =
    zoned.getHours() * 3600 + zoned.getMinutes() * 60 + zoned.getSeconds();

  return hours
    .filter((h) => h.day_of_week === dow)
    .some(
      (h) =>
        secondsNow >= timeToSeconds(h.opens_at) &&
        secondsNow < effectiveClose(h.closes_at),
    );
}
