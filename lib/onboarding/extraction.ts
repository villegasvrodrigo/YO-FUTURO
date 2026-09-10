import { z } from 'zod';

export const ExtractedProfileSchema = z.object({
  name: z.string().nullable(),
  currentAge: z.number().int().nullable(),
  futureSelfAge: z.number().int().nullable(),
  focusArea: z.enum(['carrera', 'salud', 'relaciones', 'finanzas', 'personal', 'paz', 'cuerpo']).nullable(),
  tone: z.enum(['motivador', 'exigente', 'tierno', 'directo']).nullable(),
  values: z.string().nullable(),
  goals: z.array(z.string()).nullable(),
  deliveryHour: z.number().int().nullable(),
  currentEnergySummary: z.string().nullable(),
  blockingPattern: z.string().nullable(),
  futureVision: z.string().nullable(),
});

export type ExtractedProfile = z.infer<typeof ExtractedProfileSchema>;

export const OnboardingTurnSchema = z.object({
  assistantReply: z.string(),
  extracted: ExtractedProfileSchema,
  done: z.boolean(),
});

export type OnboardingTurnResult = z.infer<typeof OnboardingTurnSchema>;

/**
 * Looser mirror of ExtractedProfileSchema used ONLY for the raw Claude response.
 * The SDK's structured-output helper renders Zod enums as description hints, not
 * true JSON-schema enums, so Claude can still emit an out-of-enum value. Parsing
 * that against the strict schema would throw inside messages.parse(); parsing it
 * against this one lets us degrade gracefully via normalizeRawTurn().
 */
const RawExtractedProfileSchema = z.object({
  name: z.string().nullable(),
  currentAge: z.number().int().nullable(),
  futureSelfAge: z.number().int().nullable(),
  focusArea: z.string().nullable(),
  tone: z.string().nullable(),
  values: z.string().nullable(),
  goals: z.array(z.string()).nullable(),
  deliveryHour: z.number().int().nullable(),
  currentEnergySummary: z.string().nullable(),
  blockingPattern: z.string().nullable(),
  futureVision: z.string().nullable(),
});

export const RawOnboardingTurnSchema = z.object({
  assistantReply: z.string(),
  extracted: RawExtractedProfileSchema,
  done: z.boolean(),
});

type RawOnboardingTurnResult = z.infer<typeof RawOnboardingTurnSchema>;

const VALID_FOCUS_AREAS = ['carrera', 'salud', 'relaciones', 'finanzas', 'personal', 'paz', 'cuerpo'] as const;
const VALID_TONES = ['motivador', 'exigente', 'tierno', 'directo'] as const;

/** Maps a raw Claude turn onto the strict ExtractedProfile, nulling invalid enums. */
export function normalizeRawTurn(raw: RawOnboardingTurnResult): OnboardingTurnResult {
  const focusArea = (VALID_FOCUS_AREAS as readonly string[]).includes(raw.extracted.focusArea ?? '')
    ? (raw.extracted.focusArea as ExtractedProfile['focusArea'])
    : null;
  const tone = (VALID_TONES as readonly string[]).includes(raw.extracted.tone ?? '')
    ? (raw.extracted.tone as ExtractedProfile['tone'])
    : null;
  return {
    ...raw,
    extracted: { ...raw.extracted, focusArea, tone },
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const EMPTY_EXTRACTED_PROFILE: ExtractedProfile = {
  name: null,
  currentAge: null,
  futureSelfAge: null,
  focusArea: null,
  tone: null,
  values: null,
  goals: null,
  deliveryHour: null,
  currentEnergySummary: null,
  blockingPattern: null,
  futureVision: null,
};

export function mergeExtracted(
  prev: ExtractedProfile,
  next: ExtractedProfile
): ExtractedProfile {
  const merged = { ...prev };
  (Object.keys(next) as (keyof ExtractedProfile)[]).forEach((key) => {
    const value = next[key];
    // Skip empty values so a later turn can't erase already-extracted data.
    if (value === null) return;
    if (typeof value === 'string' && value.trim() === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    (merged as Record<keyof ExtractedProfile, unknown>)[key] = value;
  });
  return merged;
}
