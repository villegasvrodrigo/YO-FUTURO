export function isDueNow(deliveryHourLocal: number, timezone: string, nowUtc: Date): boolean {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).format(nowUtc);
  const localHour = Number(formatted) % 24;
  return localHour === deliveryHourLocal;
}
