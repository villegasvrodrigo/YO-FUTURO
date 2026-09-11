import { describe, it, expect, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/onboarding/chat', () => ({
  runOnboardingTurn: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { runOnboardingTurn } from '@/lib/onboarding/chat';
import { POST } from './route';

function mockAuthenticatedUser() {
  (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  });
}

/** The route only ever calls request.json(), so a plain Request is enough. */
function buildRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/onboarding/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('POST /api/onboarding/chat', () => {
  it('rejects requests without an authenticated session', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });

    const response = await POST(buildRequest({ transcript: [] }));

    expect(response.status).toBe(401);
  });

  it('rejects an authenticated request whose body fails validation', async () => {
    mockAuthenticatedUser();

    const missingTranscript = await POST(buildRequest({}));
    expect(missingTranscript.status).toBe(400);

    const emptyTranscript = await POST(buildRequest({ transcript: [] }));
    expect(emptyTranscript.status).toBe(400);

    const badRole = await POST(
      buildRequest({ transcript: [{ role: 'system', content: 'hola' }] })
    );
    expect(badRole.status).toBe(400);

    expect(runOnboardingTurn).not.toHaveBeenCalled();
  });

  it('returns the onboarding turn result for a valid authenticated request', async () => {
    mockAuthenticatedUser();
    const turn = {
      assistantReply: '¿Qué edad tienes?',
      finished: false,
    };
    (runOnboardingTurn as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(turn);

    const response = await POST(
      buildRequest({ transcript: [{ role: 'user', content: 'Me llamo Ana' }] })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(turn);
    expect(runOnboardingTurn).toHaveBeenCalledWith([{ role: 'user', content: 'Me llamo Ana' }]);
  });
});
