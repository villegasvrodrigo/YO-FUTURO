export function emptyStateCopy(deliveryHourLocal: number, timezone: string, paused = false): string {
  if (paused) {
    return 'Tu yo futuro todavía no te ha escrito — tus correos están en pausa, así que tu primer mensaje llegará cuando los reanudes desde Perfil.';
  }
  return `Tu yo futuro todavía no te ha escrito — tu primer mensaje llegará a las ${deliveryHourLocal}:00 de ${timezone}.`;
}
