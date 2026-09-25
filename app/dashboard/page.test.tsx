import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';

const getUser = vi.fn();
const from = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser }, from }) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  usePathname: () => '/dashboard',
}));
vi.mock('@/lib/insights/latest', () => ({ getLatestInsight: vi.fn() }));

const { default: DashboardPage } = await import('./page');
const { getLatestInsight } = await import('@/lib/insights/latest');

type Result = { data: unknown; error: { message: string } | null };

// Each table answers when the test says so (release), and records when its query started.
function deferredTables() {
  const started: string[] = [];
  const releases: Record<string, (result: Result) => void> = {};
  const pending: Record<string, Promise<Result>> = {};
  for (const table of ['profiles', 'messages', 'daily_tasks']) {
    pending[table] = new Promise((resolve) => (releases[table] = resolve));
  }
  from.mockImplementation((table: string) => {
    const builder: Record<string, unknown> = {
      then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => {
        started.push(table);
        return pending[table].then(resolve, reject);
      },
      maybeSingle: () => {
        started.push(table);
        return pending[table];
      },
    };
    for (const method of ['select', 'eq', 'order', 'limit']) builder[method] = () => builder;
    return builder;
  });
  return { started, releases };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  vi.mocked(getLatestInsight).mockResolvedValue({ insightDate: '2026-09-25', content: 'La calma también se practica.' });
});

afterEach(() => {
  vi.restoreAllMocks();
  getUser.mockReset();
  from.mockReset();
  vi.mocked(getLatestInsight).mockReset();
});

describe('Inicio', () => {
  it('reads the profile, the latest email and the insight at the same time; the tasks wait only for the profile', async () => {
    const { started, releases } = deferredTables();

    const page = DashboardPage();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Before any answer: profile, email and insight have all been asked for, tasks not yet.
    expect(started).toEqual(expect.arrayContaining(['profiles', 'messages']));
    expect(started).not.toContain('daily_tasks');
    expect(getLatestInsight).toHaveBeenCalledWith(expect.anything(), 'u1');

    releases.profiles({ data: { name: 'Rodrigo', timezone: 'America/Mexico_City', delivery_paused: false }, error: null });
    releases.messages({ data: null, error: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toContain('daily_tasks');

    releases.daily_tasks({
      data: [
        {
          id: 't1',
          user_id: 'u1',
          task_date: '2026-09-25',
          position: 1,
          description: 'Anota tres gastos.',
          completed: false,
          completed_at: null,
          created_at: '',
        },
      ],
      error: null,
    });
    const html = renderToString(await page);

    expect(html).toContain('Rodrigo');
    expect(html).toContain('Anota tres gastos.');
    expect(html).toContain(renderToString(<>{'La calma también se practica.'}</>));
  });

  it('asks each table only once', async () => {
    const { started, releases } = deferredTables();
    const page = DashboardPage();
    releases.profiles({ data: { name: 'Rodrigo', timezone: 'America/Mexico_City', delivery_paused: false }, error: null });
    releases.messages({ data: null, error: null });
    releases.daily_tasks({ data: [], error: null });
    await page;

    expect(started.filter((t) => t === 'profiles')).toHaveLength(1);
    expect(started.filter((t) => t === 'messages')).toHaveLength(1);
    expect(started.filter((t) => t === 'daily_tasks')).toHaveLength(1);
  });

  it('shows no tasks, without failing, when the profile has no time zone or the tasks read fails', async () => {
    for (const [timezone, tasks] of [
      [null, { data: [], error: null }],
      ['America/Mexico_City', { data: null, error: { message: 'boom' } }],
    ] as const) {
      const { started, releases } = deferredTables();
      const page = DashboardPage();
      releases.profiles({ data: { name: 'Rodrigo', timezone, delivery_paused: false }, error: null });
      releases.messages({ data: null, error: null });
      releases.daily_tasks(tasks);

      const html = renderToString(await page);

      expect(html).toContain('Rodrigo');
      if (timezone === null) expect(started).not.toContain('daily_tasks');
    }
  });

  it('sends a visitor without a session to login', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(DashboardPage()).rejects.toThrow('redirect:/login');
  });
});
