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
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@/lib/insights/latest', () => ({ getLatestInsight: vi.fn() }));

const { default: DashboardPage } = await import('./page');
const { getLatestInsight } = await import('@/lib/insights/latest');

const noParams = { searchParams: Promise.resolve({}) } as never;
const replayParams = { searchParams: Promise.resolve({ bienvenida: '1' }) } as never;

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

    const page = DashboardPage(noParams);
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
    const page = DashboardPage(noParams);
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
      const page = DashboardPage(noParams);
      releases.profiles({ data: { name: 'Rodrigo', timezone, delivery_paused: false }, error: null });
      releases.messages({ data: null, error: null });
      releases.daily_tasks(tasks);

      const html = renderToString(await page);

      expect(html).toContain('Rodrigo');
      // Without a time zone, today's tasks are still read, on the fallback time zone's day.
      if (timezone === null) expect(started).toContain('daily_tasks');
    }
  });

  it('sends a visitor without a session to login', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(DashboardPage(noParams)).rejects.toThrow('redirect:/login');
  });

  describe('the welcome', () => {
    const answerAll = (releases: Record<string, (r: Result) => void>) => {
      releases.profiles({
        data: { name: 'Rodrigo', timezone: 'America/Mexico_City', delivery_paused: false, future_self_age: 50, delivery_hour_local: 8 },
        error: null,
      });
      releases.messages({ data: null, error: null });
      releases.daily_tasks({ data: [], error: null });
    };

    it('shows once, the first time: an account without the mark sees it (existing accounts too)', async () => {
      const { releases } = deferredTables();
      const page = DashboardPage(noParams);
      answerAll(releases);
      const html = renderToString(await page);

      expect(html).toContain('aria-label="Bienvenida"');
      expect(html).toContain('Rodrigo, tu yo futuro ya te conoce.');
      expect(html.replace(/<!-- -->/g, '')).toContain('PASO 1 DE 5');
    });

    it('does not show again once the account has the mark', async () => {
      getUser.mockResolvedValue({ data: { user: { id: 'u1', user_metadata: { bienvenida_yo_futuro: '2026-10-02T12:00:00Z' } } } });
      const { releases } = deferredTables();
      const page = DashboardPage(noParams);
      answerAll(releases);

      expect(renderToString(await page)).not.toContain('aria-label="Bienvenida"');
    });

    it('shows again from Perfil\'s link, even with the mark', async () => {
      getUser.mockResolvedValue({ data: { user: { id: 'u1', user_metadata: { bienvenida_yo_futuro: '2026-10-02T12:00:00Z' } } } });
      const { releases } = deferredTables();
      const page = DashboardPage(replayParams);
      answerAll(releases);

      expect(renderToString(await page)).toContain('aria-label="Bienvenida"');
    });
  });

  describe("today's message", () => {
    // 2026-10-04 18:00 UTC is 12:00 on Oct 4 in Mexico City.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-04T18:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const open = async (message: unknown, paused = false, tasks: unknown[] = []) => {
      getUser.mockResolvedValue({ data: { user: { id: 'u1', user_metadata: { bienvenida_yo_futuro: 'x' } } } });
      const { releases } = deferredTables();
      const page = DashboardPage(noParams);
      releases.profiles({ data: { name: 'Rodrigo', timezone: 'America/Mexico_City', delivery_paused: paused }, error: null });
      releases.messages({ data: message, error: null });
      releases.daily_tasks({ data: tasks, error: null });
      return renderToString(await page);
    };
    const escaped = (text: string) => renderToString(<>{text}</>);

    it("shows today's message when it exists", async () => {
      const html = await open({ id: 'm', content: 'El de hoy.', generated_at: '2026-10-04T14:00:00Z', message_date: '2026-10-04' });

      expect(html).toContain('El de hoy.');
      expect(html).not.toContain(escaped('Tu yo futuro te está escribiendo…'));
    });

    it("never shows yesterday's message as today's: it shows that today's is being written", async () => {
      const html = await open({ id: 'm', content: 'El de ayer.', generated_at: '2026-10-03T14:00:00Z', message_date: '2026-10-03' });

      expect(html).toContain(escaped('Tu yo futuro te está escribiendo…'));
      expect(html).not.toContain('El de ayer.');
    });

    it('a new person with no message yet also sees it being written', async () => {
      const html = await open(null);

      expect(html).toContain(escaped('Tu yo futuro te está escribiendo…'));
    });

    it('a paused person also gets their day: the waiting card, and no "paused" empty copies', async () => {
      const html = await open(null, true);

      expect(html).toContain(escaped('Tu yo futuro te está escribiendo…'));
      expect(html).toContain(escaped('Tus correos diarios están en pausa.'));
      expect(html).not.toContain(escaped('tus tareas llegarán cuando los reanudes'));
      expect(html).not.toContain(escaped('tu insight llegará cuando los reanudes'));
    });

    const task = (id: string, position: number, description: string) => ({
      id,
      user_id: 'u1',
      task_date: '2026-10-04',
      position,
      description,
      completed: false,
      completed_at: null,
      created_at: '',
    });
    const justCreated = { id: 'm', content: 'Recién escrito.', generated_at: '2026-10-04T17:59:30Z', message_date: '2026-10-04' };

    it('right after the app creates the message: its tasks are there, and the insight says it is on its way', async () => {
      vi.mocked(getLatestInsight).mockResolvedValue({ insightDate: '2026-10-03', content: 'El insight de ayer.' });

      const html = await open(justCreated, false, [task('t1', 1, 'Tarea uno.'), task('t2', 2, 'Tarea dos.')]);

      expect(html).toContain('Recién escrito.');
      expect(html).toContain('Tarea uno.');
      expect(html).toContain('Tarea dos.');
      expect(html).not.toContain(escaped('Tus tareas llegan con tu mensaje de hoy.'));
      expect(html).toContain(escaped('Tu insight está en camino…'));
      expect(html).not.toContain('El insight de ayer.');
    });

    it("as soon as today's insight exists, it is shown instead of the waiting line", async () => {
      vi.mocked(getLatestInsight).mockResolvedValue({ insightDate: '2026-10-04', content: 'El insight de hoy.' });

      const html = await open(justCreated);

      expect(html).toContain(escaped('El insight de hoy.'));
      expect(html).not.toContain(escaped('Tu insight está en camino…'));
    });

    it('if the insight never comes, after a few minutes Inicio stops waiting and shows the card as usual', async () => {
      vi.mocked(getLatestInsight).mockResolvedValue({ insightDate: '2026-10-03', content: 'El insight de ayer.' });

      const html = await open({ ...justCreated, generated_at: '2026-10-04T17:50:00Z' });

      expect(html).not.toContain(escaped('Tu insight está en camino…'));
      expect(html).toContain('El insight de ayer.');
    });
  });
});
