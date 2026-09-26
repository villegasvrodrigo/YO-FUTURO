import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { SPANISH_MX_RULE } from '@/lib/ai/language';
import { toClaudeMessages, assertValidReplyText, type ChatMessage } from './extraction';

const MODEL = 'claude-sonnet-5';

const SYNTHESIS_FAILED_MESSAGE = 'No se pudieron generar tus resultados, intenta de nuevo.';

// Generating three long narrative texts at once from a full transcript is measurably
// slower than a single conversational reply (confirmed against the real API — a
// representative full-length onboarding transcript exceeded the 30s conversational
// budget). Give it its own, more generous budget so it isn't stuck racing the same
// clock as a one-line question.
const SYNTHESIS_TIMEOUT_MS = 60_000;
const SYNTHESIS_MAX_RETRIES = 1;

const SynthesisResultSchema = z.object({
  currentEnergySummary: z.string(),
  blockingPattern: z.string(),
  futureVision: z.string(),
});

// What the screen receives: each text, or null when that section came back cut short twice
// (the results screen then shows its gentle "not ready" notice for it).
export interface SynthesisResult {
  currentEnergySummary: string | null;
  blockingPattern: string | null;
  futureVision: string | null;
}

const SYNTHESIS_FIELDS = ['currentEnergySummary', 'blockingPattern', 'futureVision'] as const;

// A complete text ends a sentence: . ! ? or …, optionally followed by a closing quote or
// parenthesis (as in «…no alcanza.»).
const COMPLETE_ENDING = /[.!?…][»”)]?$/;

/**
 * Whether a results text looks cut off. It happens when the model opens a quotation with a
 * plain double quote inside the JSON answer: the quote ends the text right there (the
 * saved texts ended in 'le repetía "' and 'sin rodeos: "'). So a text that ends with a
 * colon, with a quote, or without a final period counts as cut.
 */
export function looksCutOff(text: string): boolean {
  return !COMPLETE_ENDING.test(text.trim());
}

/**
 * Generates the three narrative results ("Tu energía actual", "El patrón que te
 * detiene", "Quién quieres ser") from a completed onboarding transcript. Deliberately
 * a separate call from runOnboardingTurn: it needs the whole conversation as context
 * and produces much longer output, so it gets its own timeout budget instead of
 * competing with the fast, per-question conversational calls.
 *
 * If any text comes back cut off (see looksCutOff), the whole results are asked for once
 * more. Each section then keeps a complete text from either attempt; a section that came
 * back cut both times is returned as null, so the screen shows its "not ready" notice
 * instead of a sentence broken in half. Throws, as before, if the first call fails.
 */
export async function runOnboardingSynthesis(
  transcript: ChatMessage[],
  client: Anthropic = new Anthropic()
): Promise<SynthesisResult> {
  const first = await requestSynthesis(transcript, client);
  if (!SYNTHESIS_FIELDS.some((field) => looksCutOff(first[field]))) {
    return first;
  }

  console.warn('[onboarding-synthesis] un texto de la radiografía salió cortado; se pide una vez más');
  let second: SynthesisCandidate | null = null;
  try {
    // No SDK-level retry this time: at most one more 60 s call, so first + second stay within
    // the time the onboarding screen waits for the results (SYNTHESIZE_TIMEOUT_MS, 130 s).
    second = await requestSynthesis(transcript, client, 0);
  } catch (err) {
    // The complete sections of the first attempt are still good.
    console.error('[onboarding-synthesis] falló el segundo intento', err);
  }

  const pick = (field: (typeof SYNTHESIS_FIELDS)[number]): string | null => {
    const complete = [second?.[field], first[field]].find(
      (text): text is string => typeof text === 'string' && !looksCutOff(text)
    );
    if (!complete) console.warn(`[onboarding-synthesis] ${field} salió cortado dos veces; se muestra el aviso`);
    return complete ?? null;
  };
  return {
    currentEnergySummary: pick('currentEnergySummary'),
    blockingPattern: pick('blockingPattern'),
    futureVision: pick('futureVision'),
  };
}

type SynthesisCandidate = z.infer<typeof SynthesisResultSchema>;

/**
 * A description of why a synthesis call failed, safe to write to the server logs: the error
 * type, and for errors from the Claude API its HTTP status, error type and message (those
 * describe the API's problem, e.g. "overloaded_error"). Any other error only gets its type:
 * its message could echo part of the model's answer, which is built from the user's
 * private onboarding answers.
 */
export function describeSynthesisError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const body = err.error as { error?: { type?: unknown } } | undefined;
    const apiType = typeof body?.error?.type === 'string' ? body.error.type : 'desconocido';
    return `${err.constructor.name} (status=${err.status ?? 'sin status'}, tipo=${apiType}): ${err.message}`;
  }
  if (err instanceof Error) return `${err.name} (sin detalle: el mensaje podría incluir texto de la respuesta)`;
  return `error de tipo ${typeof err}`;
}

// One call to Claude for the three texts. Throws on any failure or invalid answer, always
// with the same generic message for the user; the real reason goes only to the server logs
// (never the user's answers nor the generated texts).
async function requestSynthesis(
  transcript: ChatMessage[],
  client: Anthropic,
  maxRetries: number = SYNTHESIS_MAX_RETRIES
): Promise<SynthesisCandidate> {
  let response;
  try {
    response = await client.messages.parse(
      {
        model: MODEL,
        max_tokens: 4096,
        system: buildSynthesisPrompt(),
        messages: toClaudeMessages(transcript),
        output_config: { format: zodOutputFormat(SynthesisResultSchema) },
      },
      { timeout: SYNTHESIS_TIMEOUT_MS, maxRetries }
    );
  } catch (err) {
    console.error(`[onboarding-synthesis] falló la llamada a la IA: ${describeSynthesisError(err)}`);
    throw new Error(SYNTHESIS_FAILED_MESSAGE);
  }

  if (!response.parsed_output) {
    // stop_reason says why (e.g. "max_tokens", "refusal") without including any text.
    console.error(
      `[onboarding-synthesis] la IA no devolvió una respuesta estructurada (stop_reason=${response.stop_reason ?? 'desconocido'})`
    );
    throw new Error('Claude no devolvió una respuesta estructurada válida');
  }

  for (const field of SYNTHESIS_FIELDS) {
    try {
      assertValidReplyText(response.parsed_output[field], SYNTHESIS_FAILED_MESSAGE);
    } catch (err) {
      console.error(`[onboarding-synthesis] el texto ${field} vino vacío o con formato inválido`);
      throw err;
    }
  }

  return response.parsed_output;
}

function buildSynthesisPrompt(): string {
  return `Ya tuviste una conversación profunda en español con esta persona para prepararla para recibir mensajes diarios de su "yo futuro". A partir de TODO lo que compartió en la conversación (nunca texto genérico ni plantillas fijas), sintetiza tres textos narrativos:
- "currentEnergySummary": un diagnóstico breve de dónde está la persona hoy en esta área de su vida.
- "blockingPattern": el patrón que la detiene, basado en sus recuerdos de mayor intensidad emocional, su relación día a día con el tema, y sus momentos de mayor estrés.
- "futureVision": quién quiere llegar a ser, basado en su visión a futuro y en cómo describió a esa versión de sí misma.

Responde con un JSON que tenga exactamente estos tres campos, cada uno con un texto cálido, específico y en español, que termine en punto.

Si citas algo que la persona dijo, o algo que le decían (por ejemplo, una frase de su papá o de su mamá), escribe la cita entre comillas latinas « », así: le repetía «nunca alcanza». Nunca uses comillas rectas (") dentro de los textos.

${SPANISH_MX_RULE}`;
}
