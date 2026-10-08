import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

let signedIn: string | null;
const upsert = vi.fn();
const deleteEq = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: signedIn ? { id: signedIn } : null } }) } }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert,
      delete: () => ({ eq: (c1: string, v1: unknown) => ({ eq: (c2: string, v2: unknown) => deleteEq([c1, v1], [c2, v2]) }) }),
    }),
  }),
}));

const { POST, DELETE } = await import('./route');

const phone = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'clave', auth: 'secreto' } };
const req = (method: 'POST' | 'DELETE', body: unknown) =>
  new NextRequest('http://localhost/api/push/suscripcion', {
    method,
    body: JSON.stringify(body),
    headers: { 'user-agent': 'iPhone' },
  });

beforeEach(() => {
  signedIn = 'ana';
  vi.stubEnv('PUSH_ENABLED', 'true');
  vi.stubEnv('VAPID_PUBLIC_KEY', 'BPublica');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'privada');
  upsert.mockResolvedValue({ error: null });
  deleteEq.mockResolvedValue({ error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  upsert.mockReset();
  deleteEq.mockReset();
});

describe('POST /api/push/suscripcion', () => {
  it('saves this phone for the signed-in person (moving it if it was on another account)', async () => {
    const res = await POST(req('POST', phone));

    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      { endpoint: phone.endpoint, p256dh: 'clave', auth: 'secreto', user_id: 'ana', user_agent: 'iPhone' },
      { onConflict: 'endpoint' }
    );
  });

  it('does nothing while notifications are off (or without keys)', async () => {
    vi.stubEnv('PUSH_ENABLED', 'false');
    expect((await POST(req('POST', phone))).status).toBe(404);

    vi.stubEnv('PUSH_ENABLED', 'true');
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    expect((await POST(req('POST', phone))).status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('needs a session', async () => {
    signedIn = null;

    expect((await POST(req('POST', phone))).status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects anything that is not a real subscription', async () => {
    for (const body of [{}, { ...phone, endpoint: 'http://inseguro' }, { endpoint: phone.endpoint, keys: {} }]) {
      expect((await POST(req('POST', body))).status).toBe(400);
    }
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/push/suscripcion', () => {
  it("removes this phone, only from the signed-in person's own", async () => {
    const res = await DELETE(req('DELETE', { endpoint: phone.endpoint }));

    expect(res.status).toBe(200);
    expect(deleteEq).toHaveBeenCalledWith(['endpoint', phone.endpoint], ['user_id', 'ana']);
  });

  it('needs a session', async () => {
    signedIn = null;

    expect((await DELETE(req('DELETE', { endpoint: phone.endpoint }))).status).toBe(401);
  });
});
