import { describe, it, expect, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

function buildRequest(query: string): NextRequest {
  return new Request(`http://localhost/auth/confirm${query}`) as unknown as NextRequest;
}

function mockVerifyOtp(result: { error: { message: string } | null }) {
  const verifyOtp = vi.fn().mockResolvedValue(result);
  (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { verifyOtp },
  });
  return verifyOtp;
}

function locationOf(response: Response) {
  return new URL(response.headers.get('location')!);
}

const INVALID_LINK_MESSAGE = 'El enlace no es válido o ya expiró. Inicia sesión o regístrate de nuevo.';

describe('GET /auth/confirm', () => {
  it('redirects to /login with an error when token_hash is missing', async () => {
    const response = await GET(buildRequest('?type=signup'));

    const location = locationOf(response);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe(INVALID_LINK_MESSAGE);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('redirects to /login with an error when type is missing', async () => {
    const response = await GET(buildRequest('?token_hash=abc123'));

    expect(locationOf(response).pathname).toBe('/login');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('redirects to /login with an error when type is not a recognized value', async () => {
    const response = await GET(buildRequest('?token_hash=abc123&type=not-a-real-type'));

    expect(locationOf(response).pathname).toBe('/login');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('redirects to /login with an error when verifyOtp fails', async () => {
    const verifyOtp = mockVerifyOtp({ error: { message: 'Token has expired' } });

    const response = await GET(buildRequest('?token_hash=abc123&type=signup'));

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'signup' });
    const location = locationOf(response);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe(INVALID_LINK_MESSAGE);
  });

  it('redirects to /onboarding when verifyOtp succeeds', async () => {
    mockVerifyOtp({ error: null });

    const response = await GET(buildRequest('?token_hash=abc123&type=signup'));

    expect(locationOf(response).pathname).toBe('/onboarding');
  });
});
