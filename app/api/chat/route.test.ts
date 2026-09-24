import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const getUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ fake: 'admin' })) }));
vi.mock('./sendMessage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sendMessage')>()),
  sendChatMessage: vi.fn(),
}));

const { POST } = await import('./route');
const { sendChatMessage } = await import('./sendMessage');
const { createAdminClient } = await import('@/lib/supabase/admin');

const OWNER = '39fc48c8-e574-43a4-a192-b0ce420686d2';

function request(body: string) {
  return new NextRequest('http://localhost/api/chat', { method: 'POST', body });
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(sendChatMessage).mockResolvedValue({
    status: 200,
    body: { reply: 'Aquí estoy.', isCrisis: false, messagesLeft: 19 },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(sendChatMessage).mockReset();
  vi.mocked(createAdminClient).mockClear();
  getUser.mockReset();
});

describe('POST /api/chat', () => {
  it('answers 401 without a session', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(request('{"message":"Hola"}'));

    expect(response.status).toBe(401);
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it("tells any other account the chat isn't available, without touching the database or the AI", async () => {
    getUser.mockResolvedValue({ data: { user: { id: '0a2a2da9-9330-4154-96fa-5be6c82da257' } } });

    const response = await POST(request('{"message":"Hola"}'));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'El chat todavía no está disponible.', code: 'not_available' });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it("passes the owner's message on and returns its answer", async () => {
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });

    const response = await POST(request('{"message":"Hola"}'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply: 'Aquí estoy.', isCrisis: false, messagesLeft: 19 });
    expect(vi.mocked(sendChatMessage).mock.calls[0][0]).toMatchObject({ userId: OWNER, message: 'Hola' });
  });

  it('passes on the status of a failed message, as JSON', async () => {
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });
    vi.mocked(sendChatMessage).mockResolvedValue({
      status: 429,
      body: { error: 'Por hoy ya conversamos lo suficiente. Seguimos mañana.', code: 'limit_reached', messagesLeft: 0 },
    });

    const response = await POST(request('{"message":"Hola"}'));

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: 'limit_reached' });
  });

  it('treats a malformed body as a missing message', async () => {
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });

    await POST(request('not json'));

    expect(vi.mocked(sendChatMessage).mock.calls[0][0].message).toBeUndefined();
  });

  it('answers a JSON error when the database client cannot be created', async () => {
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });
    vi.mocked(createAdminClient).mockImplementationOnce(() => {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    });

    const response = await POST(request('{"message":"Hola"}'));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: 'unavailable' });
    expect(sendChatMessage).not.toHaveBeenCalled();
  });
});
