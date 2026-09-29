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

// Same-day recovery: besides the people whose hour it is, each run also takes the ones whose
// hour already passed today by at most this many hours. Someone whose message failed at their
// hour (an AI outage, for example) gets it in one of the next runs, the same day. The route
// skips anyone who already has today's message, so nobody ever gets two.
export const CATCH_UP_HOURS = 4;

/**
 * How many hours after the person's delivery hour it is now, in their local day: 0 at their
 * hour, 1 to 23 later that same day, null before their hour. It is always the same local day:
 * after midnight the count starts over, so a day that was missed is never sent the next day.
 * Throws (e.g. RangeError) if `timezone` isn't a valid IANA zone name.
 */
export function hoursPastDelivery(deliveryHourLocal: number, timezone: string, nowUtc: Date): number | null {
  const late = getLocalHour(timezone, nowUtc) - deliveryHourLocal;
  return late >= 0 ? late : null;
}

export interface DueProfileSummary {
  nowUtcIso: string;
  totalProfiles: number;
  // hoursLate: 0 at their hour; 1 to CATCH_UP_HOURS when it's a same-day recovery.
  due: { id: string; timezone: string; localHour: number; hoursLate: number }[];
  excluded: { id: string; timezone: string; error: string }[];
  // Profiles with their daily emails paused, whatever their hour: never due. dueThisHour
  // says whether it would have been their hour, so the log shows who was skipped for it.
  paused: { id: string; timezone: string; dueThisHour: boolean }[];
}

/**
 * Sorts every profile into "due" (their hour, or up to CATCH_UP_HOURS after it today),
 * "excluded" (invalid timezone) or "paused", and
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
      const hoursLate = hoursPastDelivery(profile.delivery_hour_local, profile.timezone, nowUtc);
      if (hoursLate !== null && hoursLate <= CATCH_UP_HOURS) {
        due.push({ id: profile.id, timezone: profile.timezone, localHour, hoursLate });
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
