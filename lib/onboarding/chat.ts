import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { OnboardingTurnSchema, type OnboardingTurnResult, type ChatMessage } from './extraction';
import { ONBOARDING_SCRIPT, type OnboardingScriptStep } from './script';

const MODEL = 'claude-sonnet-5';

export async function runOnboardingTurn(
  transcript: ChatMessage[],
  script: OnboardingScriptStep[] = ONBOARDING_SCRIPT,
  client: Anthropic = new Anthropic()
): Promise<OnboardingTurnResult> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(script),
    messages: transcript.map((m) => ({ role: m.role, content: m.content })),
    output_config: { format: zodOutputFormat(OnboardingTurnSchema) },
  });

  if (!response.parsed_output) {
    throw new Error('Claude no devolvió una respuesta estructurada válida');
  }

  return response.parsed_output;
}

function buildSystemPrompt(script: OnboardingScriptStep[]): string {
  const topics = script.map((s) => `- ${s.field}: ${s.instruction}`).join('\n');
  return `Eres un guía cálido que ayuda a alguien a prepararse para recibir mensajes diarios de su "yo futuro". Debes indagar, en una conversación natural en español, sobre estos temas:
${topics}

En cada turno, responde con un JSON que tenga: "assistantReply" (un mensaje breve y natural para continuar la conversación, o para despedirte si ya terminaste), "extracted" (los datos que puedas inferir con confianza de TODA la conversación hasta ahora, usando null en lo que aún no sepas con certeza), y "done" (true solo cuando todos los temas de arriba ya tengan un valor no nulo en "extracted").`;
}
