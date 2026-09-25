import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';

const getUser = vi.fn();
const from = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser }, from }) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  usePathname: () => '/chat',
}));
// after() only records the callback here: the tests run it themselves when they need to.
const after = vi.fn();
vi.mock('next/server', () => ({ after }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ fake: 'admin' }) }));
vi.mock('./ensureSummary', () => ({ ensureLastSummary: vi.fn() }));
const { ensureLastSummary } = await import('./ensureSummary');

const { default: ChatPage } = await import('./page');

const OWNER = '39fc48c8-e574-43a4-a192-b0ce420686d2';
const escaped = (text: string) => renderToString(<>{text}</>);

// Answers each table with the given result, whatever the query.
function tables(results: Record<string, { data: unknown; error: { message: string } | null }>) {
  from.mockImplementation((table: string) => {
    const result = results[table] ?? { data: null, error: null };
    const builder: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      maybeSingle: () => Promise.resolve(result),
    };
    for (const method of ['select', 'eq', 'order', 'lt', 'limit']) builder[method] = () => builder;
    return builder;
  });
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  getUser.mockReset();
  from.mockReset();
  after.mockReset();
  vi.mocked(ensureLastSummary).mockReset();
});

describe('/chat', () => {
  it('sends a visitor without a session to login', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(ChatPage()).rejects.toThrow('redirect:/login');
  });

  it('opens the chat for any account, not only the owner\'s', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '0a2a2da9-9330-4154-96fa-5be6c82da257' } } });
    tables({ profiles: { data: { timezone: 'America/Mexico_City' }, error: null }, chat_messages: { data: [], error: null } });

    const html = renderToString(await ChatPage());

    expect(html).toContain('<textarea');
    expect(html).toContain('href="/chat"');
  });

  it('with CHAT_ENABLED=false, shows everyone the "not available yet" notice, without reading the chat', async () => {
    vi.stubEnv('CHAT_ENABLED', 'false');
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });

    const html = renderToString(await ChatPage());

    expect(html).toContain(escaped('todavía no está disponible'));
    expect(html).not.toContain('textarea');
    expect(from).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    // As before: the usual page padding, and a bar where Chat is still "Próximamente".
    expect(html).toContain('pb-40');
    expect(html.match(/<nav/g)).toHaveLength(1);
    expect(html).not.toContain('href="/chat"');
  });

  it("after the owner's page is sent, checks the last conversation's summary for today's local date", async () => {
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });
    tables({ profiles: { data: { timezone: 'America/Mexico_City' }, error: null }, chat_messages: { data: [], error: null } });

    await ChatPage();

    expect(after).toHaveBeenCalledTimes(1);
    expect(ensureLastSummary).not.toHaveBeenCalled();
    await after.mock.calls[0][0]();
    expect(vi.mocked(ensureLastSummary).mock.calls[0][0]).toMatchObject({ userId: OWNER, today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it('a failing summary step never breaks anything', async () => {
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });
    tables({ profiles: { data: { timezone: 'America/Mexico_City' }, error: null }, chat_messages: { data: [], error: null } });
    vi.mocked(ensureLastSummary).mockRejectedValue(new Error('boom'));

    await ChatPage();

    await expect(after.mock.calls[0][0]()).resolves.toBeUndefined();
  });

  it("shows the owner today's conversation and the box, with Chat active in the bar", async () => {
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });
    tables({
      profiles: { data: { timezone: 'America/Mexico_City' }, error: null },
      chat_messages: {
        data: [
          { role: 'user', content: 'Hola', is_crisis: false },
          { role: 'assistant', content: 'Aquí estoy.', is_crisis: false },
        ],
        error: null,
      },
    });

    const html = renderToString(await ChatPage());

    expect(html).toContain('Aquí estoy.');
    expect(html).toContain('<textarea');
    expect(html).toContain('href="/chat"');
    // One bar only (the chat screen's own), and no fixed padding: the screen manages its space.
    expect(html.match(/<nav/g)).toHaveLength(1);
    expect(html).not.toContain('pb-40');
  });

  it('opens locked when the 20 messages of today are used up', async () => {
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });
    const used = Array.from({ length: 20 }, () => [
      { role: 'user', content: 'm', is_crisis: false },
      { role: 'assistant', content: 'r', is_crisis: false },
    ]).flat();
    tables({ profiles: { data: { timezone: 'Not/AZone' }, error: null }, chat_messages: { data: used, error: null } });

    const html = renderToString(await ChatPage());

    expect(html).toContain(escaped('Seguimos mañana'));
    expect(html).toMatch(/<textarea[^>]*\sdisabled=""/);
  });

  it('still opens, with a kind notice, when the conversation cannot be read', async () => {
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });
    tables({ profiles: { data: null, error: null }, chat_messages: { data: null, error: { message: 'boom' } } });

    const html = renderToString(await ChatPage());

    expect(html).toContain('role="alert"');
    expect(html).toContain('<textarea');
  });

  it('offers the earlier days only when there are any', async () => {
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });
    tables({
      profiles: { data: { timezone: 'America/Mexico_City' }, error: null },
      chat_messages: { data: [{ role: 'user', content: 'Hola', is_crisis: false, chat_date: '2026-09-20' }], error: null },
    });
    expect(renderToString(await ChatPage())).toContain(escaped('Ver días anteriores'));

    tables({ profiles: { data: { timezone: 'America/Mexico_City' }, error: null }, chat_messages: { data: [], error: null } });
    expect(renderToString(await ChatPage())).not.toContain(escaped('Ver días anteriores'));
  });
});

