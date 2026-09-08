import { describe, it, expect, vi } from 'vitest';
import { generateMessage } from './generate';
import type { Profile, Goal, MessageRecord } from '@/lib/types';

const profile: Profile = {
  id: 'u1',
  name: 'Ana',
  current_age: 25,
  future_self_age: 40,
  values: 'la honestidad',
  focus_area: 'carrera',
  tone: 'motivador',
  delivery_hour_local: 8,
  timezone: 'America/Mexico_City',
  onboarding_completed: true,
  created_at: '',
  updated_at: '',
};
const goals: Goal[] = [
  { id: 'g1', user_id: 'u1', description: 'Lanzar mi startup', status: 'active', created_at: '' },
];
const recent: MessageRecord[] = [];

describe('generateMessage', () => {
  it('returns the text content and model used', async () => {
    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Sigue adelante, Ana.' }],
        }),
      },
    } as any;

    const result = await generateMessage(profile, goals, recent, fakeClient);

    expect(result).toEqual({ content: 'Sigue adelante, Ana.', modelUsed: 'claude-sonnet-5' });
    expect(fakeClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-5' })
    );
  });

  it('throws if Claude returns no text block', async () => {
    const fakeClient = {
      messages: { create: vi.fn().mockResolvedValue({ content: [] }) },
    } as any;

    await expect(generateMessage(profile, goals, recent, fakeClient)).rejects.toThrow(
      'Claude no devolvió contenido de texto'
    );
  });
});
