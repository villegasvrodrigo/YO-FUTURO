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

const VALID_FOCUS_AREAS = ['carrera', 'salud', 'relaciones', 'finanzas', 'personal', 'paz', 'cuerpo'] as const;
const VALID_TONES = ['motivador', 'exigente', 'tierno', 'directo'] as const;

/**
 * Narrows raw (unrestricted-string) focusArea/tone values onto their strict enums,
 * nulling anything out-of-enum instead of throwing. The SDK's structured-output helper
 * renders Zod enums as description hints, not true JSON-schema enums, so Claude can
 * still emit an out-of-enum value — this is what lets extraction degrade gracefully
 * instead of failing the whole call over one bad enum value.
 */
export function normalizeFocusAreaAndTone(raw: {
  focusArea: string | null;
  tone: string | null;
}): { focusArea: ExtractedProfile['focusArea']; tone: ExtractedProfile['tone'] } {
  const focusArea = (VALID_FOCUS_AREAS as readonly string[]).includes(raw.focusArea ?? '')
    ? (raw.focusArea as ExtractedProfile['focusArea'])
    : null;
  const tone = (VALID_TONES as readonly string[]).includes(raw.tone ?? '')
    ? (raw.tone as ExtractedProfile['tone'])
    : null;
  return { focusArea, tone };
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

/**
 * The Messages API requires messages[0].role === 'user' — the onboarding UI seeds the
 * transcript with a scripted assistant greeting, so drop any leading assistant turns —
 * and (confirmed against the real API: "This model does not support assistant message
 * prefill. The conversation must end with a user message.") also requires the LAST
 * message to be from the user. A finished onboarding transcript always ends with
 * Claude's own closing reply, which the extraction and synthesis calls read in full —
 * so without this, every one of those calls would fail with a 400. Shared by the
 * per-question chat call, the profile-extraction call and the narrative-synthesis call.
 */
export function toClaudeMessages(
  transcript: ChatMessage[]
): { role: 'user' | 'assistant'; content: string }[] {
  const firstUserIndex = transcript.findIndex((m) => m.role === 'user');
  const messages = (firstUserIndex === -1 ? [] : transcript.slice(firstUserIndex)).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
    messages.push({ role: 'user', content: 'Fin de la conversación.' });
  }
  return messages;
}

const LEAK_MARKERS = [
  '{',
  '}',
  'extracted',
  'assistantreply',
  'currentenergysummary',
  'blockingpattern',
  'futurevision',
  'focusarea',
  'futureselfage',
  'currentage',
  'deliveryhour',
];

/**
 * Rare structured-output glitch: the model's free-text reply comes back blank, or
 * drifts into echoing its own JSON schema (raw braces, field names like "extracted")
 * instead of staying natural language. JSON.parse()/zod already guarantee the envelope
 * itself is well-formed, so this can only be caught by inspecting the text values.
 */
export function looksLikeLeakedInternalData(text: string): boolean {
  const lower = text.toLowerCase();
  return LEAK_MARKERS.some((marker) => lower.includes(marker));
}

/** Throws `failureMessage` if `text` is blank or looks like leaked internal data. */
export function assertValidReplyText(text: string, failureMessage: string): void {
  if (text.trim() === '' || looksLikeLeakedInternalData(text)) {
    throw new Error(failureMessage);
  }
}

export const TranscriptRequestSchema = z.object({
  transcript: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(120),
});
