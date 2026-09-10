import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { runOnboardingTurn } from './chat';
import { ONBOARDING_SCRIPT } from './script';
import type { ChatMessage } from './extraction';

/** Minimal stand-in for the Anthropic client: only `messages.create` is ever used now. */
function fakeClient(create: ReturnType<typeof vi.fn>) {
  return { messages: { create } } as unknown as Anthropic;
}

function textMessage(text: string, extra: Record<string, unknown> = {}) {
  return {
    stop_reason: 'end_turn',
    usage: { output_tokens: 42 },
    content: [{ type: 'text', text }],
    ...extra,
  };
}

function resolvingCreate(message: ReturnType<typeof textMessage>) {
  return vi.fn().mockResolvedValue(message);
}

/** Builds a transcript with N user turns (plus the leading greeting), no [FIN] anywhere. */
function transcriptWithUserTurns(n: number): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'assistant', content: 'Hola, ¿cómo te llamas?' }];
  for (let i = 0; i < n; i++) {
    messages.push({ role: 'user', content: `Respuesta ${i + 1}` });
    if (i < n - 1) messages.push({ role: 'assistant', content: `Pregunta ${i + 2}` });
  }
  return messages;
}

describe('runOnboardingTurn', () => {
  it('returns the plain-text reply from Claude, not finished, when there is no [FIN] marker', async () => {
    const create = resolvingCreate(textMessage('¿Cuál es tu edad actual?'));

    const result = await runOnboardingTurn(
      [{ role: 'user', content: 'Hola' }],
      ONBOARDING_SCRIPT,
      fakeClient(create)
    );

    expect(result).toEqual({ assistantReply: '¿Cuál es tu edad actual?', finished: false });
  });

  it('strips a trailing [FIN] marker and reports the turn as finished', async () => {
    const create = resolvingCreate(textMessage('Gracias por compartir todo esto. [FIN]'));

    const result = await runOnboardingTurn(
      [{ role: 'user', content: 'Hola' }],
      ONBOARDING_SCRIPT,
      fakeClient(create)
    );

    expect(result.assistantReply).toBe('Gracias por compartir todo esto.');
    expect(result.finished).toBe(true);
  });

  it('detects the marker case-insensitively and on its own line', async () => {
    const create = resolvingCreate(textMessage('Gracias por todo.\n[Fin]'));

    const result = await runOnboardingTurn(
      [{ role: 'user', content: 'Hola' }],
      ONBOARDING_SCRIPT,
      fakeClient(create)
    );

    expect(result.assistantReply).toBe('Gracias por todo.');
    expect(result.finished).toBe(true);
  });

  it('does not treat [FIN] appearing mid-message (not at the end) as a finish signal', async () => {
    const create = resolvingCreate(textMessage('Hablemos del final [FIN] de tu jornada, ¿qué esperas?'));

    const result = await runOnboardingTurn(
      [{ role: 'user', content: 'Hola' }],
      ONBOARDING_SCRIPT,
      fakeClient(create)
    );

    expect(result.assistantReply).toBe('Hablemos del final [FIN] de tu jornada, ¿qué esperas?');
    expect(result.finished).toBe(false);
  });

  it('finishes once the safety cap of user turns is reached, even without the marker', async () => {
    const create = resolvingCreate(textMessage('Una pregunta más.'));

    const result = await runOnboardingTurn(transcriptWithUserTurns(25), ONBOARDING_SCRIPT, fakeClient(create));

    expect(result.finished).toBe(true);
  });

  it('does not finish via the safety cap below the turn limit', async () => {
    const create = resolvingCreate(textMessage('Sigamos.'));

    const result = await runOnboardingTurn(transcriptWithUserTurns(24), ONBOARDING_SCRIPT, fakeClient(create));

    expect(result.finished).toBe(false);
  });

  it('concatenates multiple text blocks and ignores non-text blocks (e.g. thinking)', async () => {
    const create = resolvingCreate(
      textMessage('¿Cómo te llamas?', {
        content: [
          { type: 'thinking', thinking: '', signature: 'abc' },
          { type: 'text', text: '¿Cómo te llamas?' },
        ],
      })
    );

    const result = await runOnboardingTurn(
      [{ role: 'user', content: 'Hola' }],
      ONBOARDING_SCRIPT,
      fakeClient(create)
    );

    expect(result.assistantReply).toBe('¿Cómo te llamas?');
  });

  it('throws a clean user-facing error when the Claude call fails', async () => {
    const create = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(
      runOnboardingTurn([{ role: 'user', content: 'Hola' }], ONBOARDING_SCRIPT, fakeClient(create))
    ).rejects.toThrow('No se pudo continuar la conversación, intenta de nuevo.');
  });

  it('falls back to a friendly closing line when Claude sends only the [FIN] marker with no text', async () => {
    const create = resolvingCreate(textMessage('[FIN]'));

    const result = await runOnboardingTurn(
      [{ role: 'user', content: 'Hola' }],
      ONBOARDING_SCRIPT,
      fakeClient(create)
    );

    expect(result.finished).toBe(true);
    expect(result.assistantReply.trim()).not.toBe('');
  });

  it('rejects a blank reply instead of returning an empty bubble', async () => {
    const create = resolvingCreate(textMessage(''));

    await expect(
      runOnboardingTurn([{ role: 'user', content: 'Hola' }], ONBOARDING_SCRIPT, fakeClient(create))
    ).rejects.toThrow('No se pudo continuar la conversación, intenta de nuevo.');
  });

  it('rejects a reply that leaks raw JSON syntax', async () => {
    const create = resolvingCreate(textMessage('...extracted:{'));

    await expect(
      runOnboardingTurn([{ role: 'user', content: 'Hola' }], ONBOARDING_SCRIPT, fakeClient(create))
    ).rejects.toThrow('No se pudo continuar la conversación, intenta de nuevo.');
  });

  it('includes every script step in the system prompt, in order', async () => {
    const create = resolvingCreate(textMessage('ok'));

    await runOnboardingTurn([{ role: 'user', content: 'Hola' }], ONBOARDING_SCRIPT, fakeClient(create));

    const callArgs = create.mock.calls[0][0];
    ONBOARDING_SCRIPT.forEach((step, i) => {
      expect(callArgs.system).toContain(`${i + 1}. ${step.instruction}`);
    });
  });

  it('instructs Claude to end with [FIN] and to never respond with structured data', async () => {
    const create = resolvingCreate(textMessage('ok'));

    await runOnboardingTurn([{ role: 'user', content: 'Hola' }], ONBOARDING_SCRIPT, fakeClient(create));

    const system = create.mock.calls[0][0].system as string;
    expect(system).toContain('[FIN]');
    expect(system.toLowerCase()).toContain('texto plano');
    expect(system).not.toContain('"assistantReply"');
    expect(system).not.toContain('"extracted"');
  });

  it('drops leading assistant messages so Claude always receives a user message first', async () => {
    const create = resolvingCreate(textMessage('ok'));

    await runOnboardingTurn(
      [
        { role: 'assistant', content: 'Hola, soy tu guía.' },
        { role: 'user', content: 'Me llamo Ana' },
        { role: 'assistant', content: '¿Qué edad tienes?' },
        { role: 'user', content: 'Tengo 25' },
      ],
      ONBOARDING_SCRIPT,
      fakeClient(create)
    );

    const callArgs = create.mock.calls[0][0];
    expect(callArgs.messages[0].role).toBe('user');
    expect(callArgs.messages).toEqual([
      { role: 'user', content: 'Me llamo Ana' },
      { role: 'assistant', content: '¿Qué edad tienes?' },
      { role: 'user', content: 'Tengo 25' },
    ]);
  });

  it('bounds a single call to 30s and at most 1 SDK-level retry', async () => {
    const create = resolvingCreate(textMessage('ok'));

    await runOnboardingTurn([{ role: 'user', content: 'Hola' }], ONBOARDING_SCRIPT, fakeClient(create));

    expect(create.mock.calls[0][1]).toEqual({ timeout: 30_000, maxRetries: 1 });
  });

  it('does not use output_config — the turn reply is plain text, not structured JSON', async () => {
    const create = resolvingCreate(textMessage('ok'));

    await runOnboardingTurn([{ role: 'user', content: 'Hola' }], ONBOARDING_SCRIPT, fakeClient(create));

    expect(create.mock.calls[0][0].output_config).toBeUndefined();
  });
});
