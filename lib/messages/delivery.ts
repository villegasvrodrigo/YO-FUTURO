/** Throws (e.g. RangeError) if `timezone` isn't a valid IANA zone name. */
export function getLocalHour(timezone: string, nowUtc: Date): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).format(nowUtc);
  // Some ICU implementations format midnight as "24" rather than "0".
  return Number(formatted) % 24;
}

export function isDueNow(deliveryHourLocal: number, timezone: string, nowUtc: Date): boolean {
  return getLocalHour(timezone, nowUtc) === deliveryHourLocal;
}

export interface DueProfileSummary {
  nowUtcIso: string;
  totalProfiles: number;
  due: { id: string; timezone: string; localHour: number }[];
  excluded: { id: string; timezone: string; error: string }[];
}

/**
 * Sorts every profile into "due this hour" or "excluded" (invalid timezone), and
 * records the local hour computed for each — the diagnostic detail a hand-wavy
 * `.filter(isDueNow)` throws away, needed to tell "nobody was due" apart from
 * "someone should have been but got silently skipped".
 */
export function summarizeDueProfiles(
  profiles: { id: string; timezone: string; delivery_hour_local: number }[],
  nowUtc: Date
): DueProfileSummary {
  const due: DueProfileSummary['due'] = [];
  const excluded: DueProfileSummary['excluded'] = [];

  for (const profile of profiles) {
    try {
      const localHour = getLocalHour(profile.timezone, nowUtc);
      if (localHour === profile.delivery_hour_local) {
        due.push({ id: profile.id, timezone: profile.timezone, localHour });
      }
    } catch (err) {
      excluded.push({
        id: profile.id,
        timezone: profile.timezone,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { nowUtcIso: nowUtc.toISOString(), totalProfiles: profiles.length, due, excluded };
}

export function isSameLocalDay(a: Date, b: Date, timezone: string): boolean {
  const format = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  return format(a) === format(b);
}
