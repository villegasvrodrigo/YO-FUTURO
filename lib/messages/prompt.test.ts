import { describe, it, expect } from 'vitest';
import { buildPrompt } from './prompt';
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

describe('buildPrompt', () => {
  it('includes the profile details', () => {
    const prompt = buildPrompt(profile, [], []);
    expect(prompt).toContain('Ana');
    expect(prompt).toContain('40 años');
    expect(prompt).toContain('motivador');
    expect(prompt).toContain('la honestidad');
    expect(prompt).toContain('carrera');
  });

  it('lists active goals', () => {
    const goals: Goal[] = [
      { id: 'g1', user_id: 'u1', description: 'Lanzar mi startup', status: 'active', created_at: '' },
    ];
    const prompt = buildPrompt(profile, goals, []);
    expect(prompt).toContain('Lanzar mi startup');
  });

  it('notes when there are no active goals', () => {
    const prompt = buildPrompt(profile, [], []);
    expect(prompt).toContain('sin metas activas registradas');
  });

  it('includes recent messages so Claude avoids repeating them', () => {
    const recent: MessageRecord[] = [
      {
        id: 'm1',
        user_id: 'u1',
        content: 'Sigue así.',
        generated_at: '',
        sent_at: null,
        send_status: 'sent',
        model_used: 'claude-sonnet-5',
      },
    ];
    const prompt = buildPrompt(profile, [], recent);
    expect(prompt).toContain('Sigue así.');
  });
});
