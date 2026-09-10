import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

describe('POST /api/onboarding/chat', () => {
  it('rejects requests without an authenticated session', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });

    const request = new Request('http://localhost/api/onboarding/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: [] }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(401);
  });
});
