import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  RawOnboardingTurnSchema,
  normalizeRawTurn,
  type OnboardingTurnResult,
  type ChatMessage,
} from './extraction';
import { ONBOARDING_SCRIPT, type OnboardingScriptStep } from './script';

const MODEL = 'claude-sonnet-5';

const TURN_FAILED_MESSAGE = 'No se pudo continuar la conversación, intenta de nuevo.';

export async function runOnboardingTurn(
  transcript: ChatMessage[],
  script: OnboardingScriptStep[] = ONBOARDING_SCRIPT,
  client: Anthropic = new Anthropic()
): Promise<OnboardingTurnResult> {
  // The Messages API requires messages[0].role === 'user'; the UI seeds the
  // transcript with the scripted greeting, so drop any leading assistant turns.
  // Consecutive same-role messages are combined by the API, so nothing else needs normalizing.
  const firstUserIndex = transcript.findIndex((m) => m.role === 'user');
  const messagesForClaude = (firstUserIndex === -1 ? [] : transcript.slice(firstUserIndex)).map(
    (m) => ({ role: m.role, content: m.content })
  );

  let response;
  try {
    response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt(script),
      messages: messagesForClaude,
      output_config: { format: zodOutputFormat(RawOnboardingTurnSchema) },
    });
  } catch {
    // Truncation, schema-validation failures and network/API errors all land here.
    // Surface a stable, user-facing message instead of raw SDK/Zod internals.
    throw new Error(TURN_FAILED_MESSAGE);
  }

  if (!response.parsed_output) {
    throw new Error('Claude no devolvió una respuesta estructurada válida');
  }

  return normalizeRawTurn(response.parsed_output);
}

function buildSystemPrompt(script: OnboardingScriptStep[]): string {
  const topics = script.map((s) => `- ${s.field}: ${s.instruction}`).join('\n');
  return `Eres un guía cálido que ayuda a alguien a prepararse para recibir mensajes diarios de su "yo futuro". Debes indagar, en una conversación natural en español, sobre estos temas:
${topics}

En cada turno, responde con un JSON que tenga: "assistantReply" (un mensaje breve y natural para continuar la conversación, o para despedirte si ya terminaste), "extracted" (los datos que puedas inferir con confianza de TODA la conversación hasta ahora, usando null en lo que aún no sepas con certeza), y "done" (true solo cuando todos los temas de arriba ya tengan un valor no nulo en "extracted").`;
}
