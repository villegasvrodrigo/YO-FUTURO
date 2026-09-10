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

// The SDK's default request timeout is 10 minutes, which left users staring at a
// disabled "Enviar" button with no feedback during a real network hiccup. Fail
// fast with at most 1 SDK-level retry so a hung call surfaces the existing
// "Reintentar" flow within ~1 minute instead of up to 10.
const CLAUDE_TIMEOUT_MS = 30_000;
const CLAUDE_MAX_RETRIES = 1;

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
    response = await client.messages.parse(
      {
        model: MODEL,
        max_tokens: 4096,
        system: buildSystemPrompt(script),
        messages: messagesForClaude,
        output_config: { format: zodOutputFormat(RawOnboardingTurnSchema) },
      },
      { timeout: CLAUDE_TIMEOUT_MS, maxRetries: CLAUDE_MAX_RETRIES }
    );
  } catch {
    // Truncation, schema-validation failures and network/API errors all land here.
    // Surface a stable, user-facing message instead of raw SDK/Zod internals.
    throw new Error(TURN_FAILED_MESSAGE);
  }

  if (!response.parsed_output) {
    throw new Error('Claude no devolvió una respuesta estructurada válida');
  }

  const result = normalizeRawTurn(response.parsed_output);

  // Rare structured-output glitch: the model's assistantReply text itself comes back
  // blank, or drifts into echoing its own JSON schema (raw braces, field names like
  // "extracted") instead of staying natural language. JSON.parse()/zod already
  // guarantee the envelope is well-formed, so this can only be caught by inspecting
  // the reply text itself. Treat it as a failed turn — same "Reintentar" path as a
  // network error — rather than ever showing the user a blank bubble or internal data.
  if (result.assistantReply.trim() === '' || containsLeakedInternalData(result.assistantReply)) {
    throw new Error(TURN_FAILED_MESSAGE);
  }

  return result;
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

function containsLeakedInternalData(assistantReply: string): boolean {
  const lower = assistantReply.toLowerCase();
  return LEAK_MARKERS.some((marker) => lower.includes(marker));
}

const REQUIRED_FIELDS = [
  'name',
  'currentAge',
  'futureSelfAge',
  'focusArea',
  'tone',
  'values',
  'goals',
  'currentEnergySummary',
  'blockingPattern',
  'futureVision',
] as const;

function buildSystemPrompt(script: OnboardingScriptStep[]): string {
  const steps = script.map((s, i) => `${i + 1}. ${s.instruction}`).join('\n');
  return `Eres un guía cálido que ayuda a alguien a prepararse para recibir mensajes diarios de su "yo futuro", a través de una conversación profunda y progresiva en español. Sigue este guion en orden, una pregunta a la vez, dejando que cada respuesta informe la siguiente:
${steps}

No preguntes por el tono que prefiere para los mensajes (motivador, exigente, tierno o directo) — infiérelo tú del registro emocional de toda la conversación.

Tampoco preguntes directamente por "values" ni "goals" — infiérelos tú también: "values" de cómo describe la versión de sí misma que quiere ser, y "goals" de su visión a 6 meses, 1 año y a largo plazo.

Cuando ya hayas recorrido el guion completo, sintetiza tres textos narrativos a partir de TODO lo que la persona compartió (nunca texto genérico ni plantillas fijas):
- "currentEnergySummary": un diagnóstico breve de dónde está la persona hoy en esta área de su vida.
- "blockingPattern": el patrón que la detiene, basado en sus recuerdos de mayor intensidad emocional, su relación día a día con el tema, y sus momentos de mayor estrés.
- "futureVision": quién quiere llegar a ser, basado en su visión a futuro y en cómo describió a esa versión de sí misma.

En cada turno, responde con un JSON que tenga: "assistantReply" (un mensaje breve, cálido y natural para continuar la conversación, o para cerrarla una vez sintetizados los tres textos), "extracted" (todos los datos que puedas inferir con confianza de TODA la conversación hasta ahora, usando null en lo que aún no sepas con certeza), y "done" (true solo cuando estos campos ya tengan un valor no nulo en "extracted": ${REQUIRED_FIELDS.join(', ')}).`;
}
