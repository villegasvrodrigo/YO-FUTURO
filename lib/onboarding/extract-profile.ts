import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { SPANISH_MX_RULE } from '@/lib/ai/language';
import {
  toClaudeMessages,
  assertValidReplyText,
  normalizeFocusAreaAndTone,
  type ChatMessage,
  type ExtractedProfile,
} from './extraction';

const MODEL = 'claude-sonnet-5';

const EXTRACTION_FAILED_MESSAGE = 'No se pudieron extraer tus datos, intenta de nuevo.';

const EXTRACTION_TIMEOUT_MS = 30_000;
const EXTRACTION_MAX_RETRIES = 1;

// Loose (unrestricted-string) schema for the raw response: see normalizeFocusAreaAndTone
// for why focusArea/tone can't be strict enums here.
const RawProfileExtractionSchema = z.object({
  name: z.string().nullable(),
  currentAge: z.number().int().nullable(),
  futureSelfAge: z.number().int().nullable(),
  focusArea: z.string().nullable(),
  tone: z.string().nullable(),
  values: z.string().nullable(),
  goals: z.array(z.string()).nullable(),
});

export type ProfileExtraction = Pick<
  ExtractedProfile,
  'name' | 'currentAge' | 'futureSelfAge' | 'focusArea' | 'tone' | 'values' | 'goals'
>;

/**
 * Reads a completed (or manually cut short) onboarding transcript and extracts the
 * factual profile fields from it in a single, dedicated call — kept separate from the
 * narrative synthesis call (extract-profile.ts vs synthesis.ts) so a purely-structured
 * JSON call (no free-form creative text field) never has to share a completion with
 * open-ended prose generation.
 */
export async function extractOnboardingProfile(
  transcript: ChatMessage[],
  client: Anthropic = new Anthropic()
): Promise<ProfileExtraction> {
  let response;
  try {
    response = await client.messages.parse(
      {
        model: MODEL,
        max_tokens: 1024,
        system: buildExtractionPrompt(),
        messages: toClaudeMessages(transcript),
        output_config: { format: zodOutputFormat(RawProfileExtractionSchema) },
      },
      { timeout: EXTRACTION_TIMEOUT_MS, maxRetries: EXTRACTION_MAX_RETRIES }
    );
  } catch {
    throw new Error(EXTRACTION_FAILED_MESSAGE);
  }

  if (!response.parsed_output) {
    throw new Error('Claude no devolvió una respuesta estructurada válida');
  }

  const raw = response.parsed_output;
  if (raw.values !== null) {
    assertValidReplyText(raw.values, EXTRACTION_FAILED_MESSAGE);
  }

  const { focusArea, tone } = normalizeFocusAreaAndTone(raw);
  return { ...raw, focusArea, tone };
}

function buildExtractionPrompt(): string {
  return `A continuación tienes una conversación completa (o parcial) en español entre un guía y una persona que se está preparando para recibir mensajes diarios de su "yo futuro". Lee TODA la conversación y extrae los siguientes datos, usando null en lo que no puedas inferir con confianza:
- "name": su nombre.
- "currentAge": su edad actual.
- "futureSelfAge": la edad de su yo futuro.
- "focusArea": el área de vida que eligió trabajar. DEBE ser EXACTAMENTE una de estas cuatro palabras en minúsculas — nunca las palabras que la persona usó tal cual: "finanzas" (si eligió "Dinero y abundancia"), "relaciones" (si eligió "Amor y relaciones"), "paz" (si eligió "Paz"), "cuerpo" (si eligió "Mi cuerpo").
- "tone": el tono que mejor le convendría para sus mensajes diarios, inferido del registro emocional de toda la conversación — nunca se lo preguntaron directamente. DEBE ser EXACTAMENTE una de estas cuatro palabras en minúsculas, nunca una descripción: "motivador", "exigente", "tierno", "directo".
- "values": una breve descripción de lo que valora, inferida de cómo describió a la versión de sí misma que quiere ser — nunca se lo preguntaron directamente. Escríbelo en PRIMERA PERSONA, como si la persona lo dijera de sí misma (ej. "Valoro la paz y la libertad", nunca "Valora la paz y la libertad").
- "goals": un array de metas breves, inferidas de su visión a 6 meses, 1 año y a largo plazo — nunca se lo preguntaron directamente como lista. Escribe cada meta en PRIMERA PERSONA (ej. "Sanar mi relación con el dinero", nunca "Sanar su relación con el dinero").

Responde solo con el JSON de estos siete campos, nada más.

${SPANISH_MX_RULE}`;
}
