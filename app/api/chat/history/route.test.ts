import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const getUser = vi.fn();
const client = { auth: { getUser } };
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));
vi.mock('./readHistory', () => ({ readEarlierDays: vi.fn() }));

const { GET } = await import('./route');
const { readEarlierDays } = await import('./readHistory');

const OWNER = '39fc48c8-e574-43a4-a192-b0ce420686d2';
const request = (query: string) => new NextRequest(`http://localhost/api/chat/history${query}`);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(readEarlierDays).mockResolvedValue({ days: [{ date: '2026-09-24', messages: [] }], hasMore: false });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(readEarlierDays).mockReset();
  getUser.mockReset();
});

describe('GET /api/chat/history', () => {
  it('answers 401 without a session', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    expect((await GET(request('?before=2026-09-25'))).status).toBe(401);
    expect(readEarlierDays).not.toHaveBeenCalled();
  });

  it("tells any other account the chat isn't available, without reading anything", async () => {
    getUser.mockResolvedValue({ data: { user: { id: '0a2a2da9-9330-4154-96fa-5be6c82da257' } } });

    const response = await GET(request('?before=2026-09-25'));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'not_available' });
    expect(readEarlierDays).not.toHaveBeenCalled();
  });

  it.each(['', '?before=', '?before=ayer', '?before=2026-02-31'])('rejects a missing or invalid date (%s)', async (query) => {
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });

    expect((await GET(request(query))).status).toBe(400);
    expect(readEarlierDays).not.toHaveBeenCalled();
  });

  it("reads the owner's earlier days with their own session", async () => {
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });

    const response = await GET(request('?before=2026-09-25'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ days: [{ date: '2026-09-24', messages: [] }], hasMore: false });
    expect(readEarlierDays).toHaveBeenCalledWith(client, OWNER, '2026-09-25');
  });

  it('answers a kind JSON error when the read fails', async () => {
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });
    vi.mocked(readEarlierDays).mockRejectedValue(new Error('db down'));

    const response = await GET(request('?before=2026-09-25'));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: 'unavailable' });
  });
});
