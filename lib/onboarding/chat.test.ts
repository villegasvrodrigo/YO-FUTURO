import { describe, it, expect, vi } from 'vitest';
import { runOnboardingTurn } from './chat';
import { EMPTY_EXTRACTED_PROFILE } from './extraction';
import { ONBOARDING_SCRIPT } from './script';

describe('runOnboardingTurn', () => {
  it('returns the parsed output from Claude', async () => {
    const fakeClient = {
      messages: {
        parse: vi.fn().mockResolvedValue({
          parsed_output: {
            assistantReply: '¿Cómo te llamas?',
            extracted: { ...EMPTY_EXTRACTED_PROFILE },
            done: false,
          },
        }),
      },
    } as any;

    const result = await runOnboardingTurn(
      [{ role: 'user', content: 'Hola' }],
      ONBOARDING_SCRIPT,
      fakeClient
    );

    expect(result.assistantReply).toBe('¿Cómo te llamas?');
    expect(result.done).toBe(false);
    expect(fakeClient.messages.parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-5' })
    );
  });

  it('throws if Claude does not return a parsed output', async () => {
    const fakeClient = {
      messages: { parse: vi.fn().mockResolvedValue({ parsed_output: null }) },
    } as any;

    await expect(
      runOnboardingTurn([{ role: 'user', content: 'Hola' }], ONBOARDING_SCRIPT, fakeClient)
    ).rejects.toThrow('Claude no devolvió una respuesta estructurada válida');
  });

  it('includes every script topic in the system prompt', async () => {
    const fakeClient = {
      messages: {
        parse: vi.fn().mockResolvedValue({
          parsed_output: {
            assistantReply: 'ok',
            extracted: { ...EMPTY_EXTRACTED_PROFILE },
            done: false,
          },
        }),
      },
    } as any;

    await runOnboardingTurn([{ role: 'user', content: 'Hola' }], ONBOARDING_SCRIPT, fakeClient);

    const callArgs = fakeClient.messages.parse.mock.calls[0][0];
    for (const step of ONBOARDING_SCRIPT) {
      expect(callArgs.system).toContain(step.field);
    }
  });
});
