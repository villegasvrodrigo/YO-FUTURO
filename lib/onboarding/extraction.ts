import { z } from 'zod';

export const ExtractedProfileSchema = z.object({
  name: z.string().nullable(),
  currentAge: z.number().int().nullable(),
  futureSelfAge: z.number().int().nullable(),
  focusArea: z.enum(['carrera', 'salud', 'relaciones', 'finanzas', 'personal']).nullable(),
  tone: z.enum(['motivador', 'exigente', 'tierno', 'directo']).nullable(),
  values: z.string().nullable(),
  goals: z.array(z.string()).nullable(),
  deliveryHour: z.number().int().nullable(),
});

export type ExtractedProfile = z.infer<typeof ExtractedProfileSchema>;

export const OnboardingTurnSchema = z.object({
  assistantReply: z.string(),
  extracted: ExtractedProfileSchema,
  done: z.boolean(),
});

export type OnboardingTurnResult = z.infer<typeof OnboardingTurnSchema>;

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
};

export function mergeExtracted(
  prev: ExtractedProfile,
  next: ExtractedProfile
): ExtractedProfile {
  const merged = { ...prev };
  (Object.keys(next) as (keyof ExtractedProfile)[]).forEach((key) => {
    if (next[key] !== null) {
      (merged as Record<keyof ExtractedProfile, unknown>)[key] = next[key];
    }
  });
  return merged;
}
