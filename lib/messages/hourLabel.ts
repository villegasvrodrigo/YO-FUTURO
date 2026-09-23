/**
 * An hour of the day (0–23, as stored in profiles.delivery_hour_local) the way people read
 * it: 8 → "8:00 a. m.", 20 → "8:00 p. m.". Midnight and noon get a word in brackets so
 * "12:00" is never ambiguous.
 */
export function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const label = `${h12}:00 ${hour < 12 ? 'a. m.' : 'p. m.'}`;
  if (hour === 0) return `${label} (medianoche)`;
  if (hour === 12) return `${label} (mediodía)`;
  return label;
}

/** The 24 choices of the delivery hour list, in order from midnight. */
export const HOUR_OPTIONS: { value: number; label: string }[] = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: hourLabel(hour),
}));
