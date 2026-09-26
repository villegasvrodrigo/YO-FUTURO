import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { SPANISH_MX_RULE } from './language';
import { runOnboardingTurn } from '@/lib/onboarding/chat';
import { ONBOARDING_SCRIPT } from '@/lib/onboarding/script';
import { extractOnboardingProfile } from '@/lib/onboarding/extract-profile';
import { runOnboardingSynthesis } from '@/lib/onboarding/synthesis';
import { buildPrompt } from '@/lib/messages/prompt';
import { generateDailyTasks } from '@/lib/tasks/generate';
import { generateDailyInsight } from '@/lib/insights/generate';
import { CHAT_INSTRUCTIONS } from '@/lib/chat/prompt';
import { SUMMARY_INSTRUCTIONS } from '@/lib/chat/summary';
import type { Profile } from '@/lib/types';

// A client that records the request and answers with `answer` (no real AI call).
function recordingClient(answer: unknown) {
  const create = vi.fn().mockResolvedValue(answer);
  const parse = vi.fn().mockResolvedValue(answer);
  return { client: { messages: { create, parse } } as unknown as Anthropic, create, parse };
}

const transcript = [
  { role: 'assistant' as const, content: 'Hola. ¿Cómo te llamas?' },
  { role: 'user' as const, content: 'Me llamo Carlos.' },
];

const profile: Profile = {
  id: 'u1',
  name: 'Carlos',
  current_age: 29,
  future_self_age: 39,
  values: 'La honestidad',
  focus_area: 'finanzas',
  tone: 'directo',
  delivery_hour_local: 8,
  timezone: 'America/Mexico_City',
  onboarding_completed: true,
  current_energy_summary: null,
  blocking_pattern: null,
  future_vision: null,
  created_at: '',
  updated_at: '',
};

const dailyInput = {
  name: 'Carlos',
  focusArea: 'finanzas' as const,
  tone: 'directo' as const,
  values: 'La honestidad',
  goals: ['Ahorrar'],
  currentEnergySummary: null,
  blockingPattern: null,
  futureVision: null,
  messageText: 'Hoy da un paso.',
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SPANISH_MX_RULE', () => {
  it('is the agreed text', () => {
    expect(SPANISH_MX_RULE).toBe(
      'Escribe siempre en español de México, natural y sin modismos exagerados. Cuando le hables a la persona, háblale de tú: nunca de usted ni de vos. No uses formas de Argentina ni de España, como «sos», «tenés», «vosotros», «habéis», «vale» o «tío».'
    );
  });
});

describe('every AI instruction in the app ends with the Mexican Spanish rule', () => {
  it('1. the onboarding conversation', async () => {
    const { client, create } = recordingClient({ content: [{ type: 'text', text: '¿Cuántos años tienes?' }] });

    await runOnboardingTurn(transcript, ONBOARDING_SCRIPT, client);

    expect(create.mock.calls[0][0].system.endsWith(`\n\n${SPANISH_MX_RULE}`)).toBe(true);
  });

  it('2. the data extraction', async () => {
    const empty = { name: null, currentAge: null, futureSelfAge: null, focusArea: null, tone: null, values: null, goals: null };
    const { client, parse } = recordingClient({ parsed_output: empty });

    await extractOnboardingProfile(transcript, client);

    expect(parse.mock.calls[0][0].system.endsWith(`\n\n${SPANISH_MX_RULE}`)).toBe(true);
  });

  it('3. the radiografía', async () => {
    const texts = { currentEnergySummary: 'Uno.', blockingPattern: 'Dos.', futureVision: 'Tres.' };
    const { client, parse } = recordingClient({ parsed_output: texts });

    await runOnboardingSynthesis(transcript, client);

    expect(parse.mock.calls[0][0].system.endsWith(`\n\n${SPANISH_MX_RULE}`)).toBe(true);
  });

  it('4. the daily email', () => {
    expect(buildPrompt(profile, [], []).endsWith(`\n\n${SPANISH_MX_RULE}`)).toBe(true);
  });

  it('5. the daily tasks', async () => {
    const { client, parse } = recordingClient({ parsed_output: { tasks: [] } });

    await generateDailyTasks({ ...dailyInput, taskDate: '2026-09-26' }, client);

    expect(parse.mock.calls[0][0].system.endsWith(`\n\n${SPANISH_MX_RULE}`)).toBe(true);
  });

  it('6. the daily insight', async () => {
    const { client, parse } = recordingClient({ parsed_output: { insight: '' } });

    await generateDailyInsight({ ...dailyInput, insightDate: '2026-09-26' }, client);

    expect(parse.mock.calls[0][0].system.endsWith(`\n\n${SPANISH_MX_RULE}`)).toBe(true);
  });

  it('7. the chat', () => {
    expect(CHAT_INSTRUCTIONS.endsWith(`\n\n${SPANISH_MX_RULE}`)).toBe(true);
  });

  it('8. the chat summary', () => {
    expect(SUMMARY_INSTRUCTIONS.endsWith(`\n\n${SPANISH_MX_RULE}`)).toBe(true);
  });
});
