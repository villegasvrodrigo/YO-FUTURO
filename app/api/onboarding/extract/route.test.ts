import { describe, it, expect, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/onboarding/extract-profile', () => ({
  extractOnboardingProfile: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { extractOnboardingProfile } from '@/lib/onboarding/extract-profile';
import { POST } from './route';

function mockAuthenticatedUser() {
  (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  });
}

function buildRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/onboarding/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('POST /api/onboarding/extract', () => {
  it('rejects requests without an authenticated session', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });

    const response = await POST(buildRequest({ transcript: [] }));

    expect(response.status).toBe(401);
  });

  it('rejects an authenticated request whose body fails validation', async () => {
    mockAuthenticatedUser();

    const emptyTranscript = await POST(buildRequest({ transcript: [] }));
    expect(emptyTranscript.status).toBe(400);

    expect(extractOnboardingProfile).not.toHaveBeenCalled();
  });

  it('returns the extracted profile for a valid authenticated request', async () => {
    mockAuthenticatedUser();
    const extraction = {
      name: 'Rodrigo',
      currentAge: 42,
      futureSelfAge: 60,
      focusArea: 'finanzas',
      tone: 'motivador',
      values: 'la calma',
      goals: ['Ahorrar'],
    };
    (extractOnboardingProfile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(extraction);

    const response = await POST(
      buildRequest({ transcript: [{ role: 'user', content: 'Ya terminé de compartir todo.' }] })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(extraction);
    expect(extractOnboardingProfile).toHaveBeenCalledWith([
      { role: 'user', content: 'Ya terminé de compartir todo.' },
    ]);
  });

  it('returns a 500 with a clean message when extraction fails', async () => {
    mockAuthenticatedUser();
    (extractOnboardingProfile as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('No se pudieron extraer tus datos, intenta de nuevo.')
    );

    const response = await POST(buildRequest({ transcript: [{ role: 'user', content: 'Hola' }] }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'No se pudieron extraer tus datos, intenta de nuevo.',
    });
  });
});
