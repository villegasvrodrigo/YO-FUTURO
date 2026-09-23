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
  // Profiles with their daily emails paused, whatever their hour: never due. dueThisHour
  // says whether it would have been their hour, so the log shows who was skipped for it.
  paused: { id: string; timezone: string; dueThisHour: boolean }[];
}

/**
 * Sorts every profile into "due this hour", "excluded" (invalid timezone) or "paused", and
 * records the local hour computed for each — the diagnostic detail a hand-wavy
 * `.filter(isDueNow)` throws away, needed to tell "nobody was due" apart from
 * "someone should have been but got silently skipped".
 * Only an explicit `delivery_paused === true` pauses: false, null or a missing field (for
 * instance, if the column didn't exist yet) are processed as usual, so a problem with the
 * pause can never stop everyone's emails.
 */
export function summarizeDueProfiles(
  profiles: { id: string; timezone: string; delivery_hour_local: number; delivery_paused?: boolean | null }[],
  nowUtc: Date
): DueProfileSummary {
  const due: DueProfileSummary['due'] = [];
  const excluded: DueProfileSummary['excluded'] = [];
  const paused: DueProfileSummary['paused'] = [];

  for (const profile of profiles) {
    if (profile.delivery_paused === true) {
      let dueThisHour = false;
      try {
        dueThisHour = getLocalHour(profile.timezone, nowUtc) === profile.delivery_hour_local;
      } catch {
        // An invalid timezone doesn't matter here: the profile is skipped either way.
      }
      paused.push({ id: profile.id, timezone: profile.timezone, dueThisHour });
      continue;
    }

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

  return { nowUtcIso: nowUtc.toISOString(), totalProfiles: profiles.length, due, excluded, paused };
}

/**
 * The calendar date of `date` in `timezone`, as "YYYY-MM-DD" (the en-CA locale formats
 * dates that way). Throws (e.g. RangeError) if `timezone` isn't a valid IANA zone name.
 */
export function getLocalDateString(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isSameLocalDay(a: Date, b: Date, timezone: string): boolean {
  return getLocalDateString(a, timezone) === getLocalDateString(b, timezone);
}
