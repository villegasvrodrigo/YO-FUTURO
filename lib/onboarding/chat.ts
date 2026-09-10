import Anthropic from '@anthropic-ai/sdk';
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

  // TEMPORARY — investigating intermittent garbled/blank replies (reported 2026-09-10).
  // Logs the untouched text exactly as the API returned it, before any parsing/merging
  // on our side, so a corrupted case can be compared against what gets saved/displayed.
  // TODO: remove this logging before merging this branch.
  console.log(
    '[onboarding-chat][raw]',
    JSON.stringify({
      stop_reason: response.stop_reason,
      usage: response.usage,
      content: response.content,
    })
  );

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

function buildSystemPrompt(script: OnboardingScriptStep[]): string {
  const steps = script.map((s, i) => `${i + 1}. ${s.instruction}`).join('\n');
  return `Eres un guía cálido que ayuda a alguien a prepararse para recibir mensajes diarios de su "yo futuro", a través de una conversación profunda y progresiva en español. Sigue este guion en orden, una pregunta a la vez, dejando que cada respuesta informe la siguiente:
${steps}

No preguntes por el tono que prefiere para los mensajes, ni directamente por sus valores o sus metas — eso se infiere aparte, de toda la conversación, una vez que termines.

Responde SIEMPRE en texto plano y natural, nunca en JSON ni con ningún formato de datos — solo la pregunta o el comentario que le dirías a la persona, como en una conversación real.

Cuando ya hayas recorrido el guion completo, ciérralo con calidez, agradécele por compartir, y termina tu mensaje agregando la palabra exacta [FIN] al final, en su propia línea. No escribas [FIN] en ningún otro momento de la conversación, ni le menciones a la persona que existe esa palabra — es una señal interna para el sistema, no parte de tu mensaje para ella.`;
}
