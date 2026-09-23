// The hour the review screen proposes when the AI found none (or found a bad one).
export const DEFAULT_DELIVERY_HOUR = 8;

/**
 * The delivery hour to preselect on the onboarding review screen. The AI's extraction only
 * promises an integer, not one in range, so anything that isn't a whole number from 0 to
 * 23 becomes DEFAULT_DELIVERY_HOUR. Otherwise the list would show one hour while a
 * different, invalid one sat behind it and failed on confirm.
 */
export function initialDeliveryHour(proposed: unknown): number {
  return typeof proposed === 'number' && Number.isInteger(proposed) && proposed >= 0 && proposed <= 23
    ? proposed
    : DEFAULT_DELIVERY_HOUR;
}
