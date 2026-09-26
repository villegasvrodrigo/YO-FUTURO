import Anthropic from '@anthropic-ai/sdk';
import { SPANISH_MX_RULE } from '@/lib/ai/language';
import { toClaudeMessages, assertValidReplyText, type ChatMessage } from './extraction';
import { ONBOARDING_SCRIPT, type OnboardingScriptStep } from './script';

const MODEL = 'claude-sonnet-5';

const TURN_FAILED_MESSAGE = 'No se pudo continuar la conversación, intenta de nuevo.';

// The SDK's default request timeout is 10 minutes, which left users staring at a
// disabled "Enviar" button with no feedback during a real network hiccup. Fail
// fast with at most 1 SDK-level retry so a hung call surfaces the existing
// "Reintentar" flow within ~1 minute instead of up to 10.
const CLAUDE_TIMEOUT_MS = 30_000;
const CLAUDE_MAX_RETRIES = 1;

// Matches a trailing "[FIN]" (any case), optionally preceded by whitespace/newlines —
// but only at the very end of the reply, so a coincidental mention mid-sentence is
// never mistaken for the finish signal.
const FINISH_MARKER = /\s*\[FIN\]\s*$/i;

// Backstop only: if the user gives invalid/ambiguous answers, Claude may need extra
// clarifying turns before it can say [FIN], so the script's own step count is not a
// reliable finish signal on its own. This cap exists purely to guarantee the
// conversation ends eventually even if the marker is somehow never produced.
const MAX_SCRIPT_TURNS = 25;

export interface OnboardingTurnResult {
  assistantReply: string;
  finished: boolean;
}

export async function runOnboardingTurn(
  transcript: ChatMessage[],
  script: OnboardingScriptStep[] = ONBOARDING_SCRIPT,
  client: Anthropic = new Anthropic()
): Promise<OnboardingTurnResult> {
  let response;
  try {
    response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 1024,
        system: buildSystemPrompt(script),
        messages: toClaudeMessages(transcript),
      },
      { timeout: CLAUDE_TIMEOUT_MS, maxRetries: CLAUDE_MAX_RETRIES }
    );
  } catch {
    // Network/API errors land here. Surface a stable, user-facing message instead
    // of raw SDK internals.
    throw new Error(TURN_FAILED_MESSAGE);
  }

  const rawText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const finishedByMarker = FINISH_MARKER.test(rawText);
  let assistantReply = rawText.replace(FINISH_MARKER, '').trim();

  // A bare "[FIN]" with no closing text is still a legitimate finish signal — don't let
  // the blank-reply guard turn it into a failed turn and lose that signal on retry.
  if (finishedByMarker && assistantReply === '') {
    assistantReply = 'Gracias por compartir todo esto conmigo.';
  }

  assertValidReplyText(assistantReply, TURN_FAILED_MESSAGE);

  const userTurnsSoFar = transcript.filter((m) => m.role === 'user').length;
  const finished = finishedByMarker || userTurnsSoFar >= MAX_SCRIPT_TURNS;

  return { assistantReply, finished };
}

/** One line of the script as the guide reads it (see OnboardingScriptStep). */
export function formatScriptStep(step: OnboardingScriptStep, index: number): string {
  const n = index + 1;
  switch (step.kind) {
    case 'note':
      return `${n}. ${step.text}`;
    case 'question':
      return `${n}. Pregunta textual: «${step.text}»`;
    case 'encouragement':
      return `${n}. Frase de aliento textual, en el mismo mensaje que la pregunta ${n + 1} y justo antes de ella: «${step.text}»`;
  }
}

function buildSystemPrompt(script: OnboardingScriptStep[]): string {
  const steps = script.map(formatScriptStep).join('\n');
  return `Eres un guía cálido que ayuda a alguien a prepararse para recibir mensajes diarios de su "yo futuro", a través de una conversación profunda y progresiva en español. Sigue este guion en orden:
${steps}

Cómo haces las preguntas:
- Haz UNA sola pregunta por mensaje, en el orden del guion.
- Escribe cada pregunta TEXTUAL, palabra por palabra, tal como aparece entre « » (sin las comillas). Nunca cambies su redacción, nunca le agregues ni le quites palabras y nunca juntes dos preguntas en un mismo mensaje.
- Antes de la pregunta puedes escribir solo UNA frase breve, de 15 palabras como máximo, reconociendo la respuesta anterior. Después de la pregunta no escribas nada más.
- La frase de aliento no es una pregunta: va textual, en el mismo mensaje que la pregunta siguiente, justo antes de ella.
- Si una respuesta no responde la pregunta o no sirve (por ejemplo, si la edad desde la que quiere que le hable su yo futuro no es mayor que su edad actual), dilo con amabilidad en una frase breve y vuelve a hacer la misma pregunta, textual.

No preguntes por el tono que prefiere para los mensajes, ni directamente por sus valores o sus metas — eso se infiere aparte, de toda la conversación, una vez que termines.

Responde SIEMPRE en texto plano y natural, nunca en JSON ni con ningún formato de datos — solo la pregunta o el comentario que le dirías a la persona, como en una conversación real.

Cuando ya hayas recorrido el guion completo, ciérralo con calidez, agradécele por compartir, y termina tu mensaje agregando la palabra exacta [FIN] al final, en su propia línea. No escribas [FIN] en ningún otro momento de la conversación, ni le menciones a la persona que existe esa palabra — es una señal interna para el sistema, no parte de tu mensaje para ella.

${SPANISH_MX_RULE}`;
}
