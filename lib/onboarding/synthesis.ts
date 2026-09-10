import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
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

export type SynthesisResult = z.infer<typeof SynthesisResultSchema>;

/**
 * Generates the three narrative results ("Tu energía actual", "El patrón que te
 * detiene", "Quién quieres ser") from a completed onboarding transcript. Deliberately
 * a separate call from runOnboardingTurn: it needs the whole conversation as context
 * and produces much longer output, so it gets its own timeout budget instead of
 * competing with the fast, per-question conversational calls.
 */
export async function runOnboardingSynthesis(
  transcript: ChatMessage[],
  client: Anthropic = new Anthropic()
): Promise<SynthesisResult> {
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
      { timeout: SYNTHESIS_TIMEOUT_MS, maxRetries: SYNTHESIS_MAX_RETRIES }
    );
  } catch {
    throw new Error(SYNTHESIS_FAILED_MESSAGE);
  }

  // TEMPORARY — investigating intermittent garbled/blank replies (reported 2026-09-10).
  console.log(
    '[onboarding-synthesize][raw]',
    JSON.stringify({
      stop_reason: response.stop_reason,
      usage: response.usage,
      content: response.content,
    })
  );

  if (!response.parsed_output) {
    throw new Error('Claude no devolvió una respuesta estructurada válida');
  }

  const { currentEnergySummary, blockingPattern, futureVision } = response.parsed_output;
  assertValidReplyText(currentEnergySummary, SYNTHESIS_FAILED_MESSAGE);
  assertValidReplyText(blockingPattern, SYNTHESIS_FAILED_MESSAGE);
  assertValidReplyText(futureVision, SYNTHESIS_FAILED_MESSAGE);

  return response.parsed_output;
}

function buildSynthesisPrompt(): string {
  return `Ya tuviste una conversación profunda en español con esta persona para prepararla para recibir mensajes diarios de su "yo futuro". A partir de TODO lo que compartió en la conversación (nunca texto genérico ni plantillas fijas), sintetiza tres textos narrativos:
- "currentEnergySummary": un diagnóstico breve de dónde está la persona hoy en esta área de su vida.
- "blockingPattern": el patrón que la detiene, basado en sus recuerdos de mayor intensidad emocional, su relación día a día con el tema, y sus momentos de mayor estrés.
- "futureVision": quién quiere llegar a ser, basado en su visión a futuro y en cómo describió a esa versión de sí misma.

Responde con un JSON que tenga exactamente estos tres campos, cada uno con un texto cálido, específico y en español.`;
}
