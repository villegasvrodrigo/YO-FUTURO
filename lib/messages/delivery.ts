export function isDueNow(deliveryHourLocal: number, timezone: string, nowUtc: Date): boolean {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).format(nowUtc);
  const localHour = Number(formatted) % 24;
  return localHour === deliveryHourLocal;
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
