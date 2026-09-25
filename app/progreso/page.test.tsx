import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';

const getUser = vi.fn();
const from = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser }, from }) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  usePathname: () => '/progreso',
}));
vi.mock('@/lib/tasks/history', () => ({ getFullTaskHistory: vi.fn() }));

const { default: ProgresoPage } = await import('./page');
const { getFullTaskHistory } = await import('@/lib/tasks/history');

// 2026-09-25 03:00 UTC: still Sep 24 in Mexico City, already Sep 25 in UTC+14.
const NOW = new Date('2026-09-25T03:00:00Z');

let releaseProfile: (value: { data: unknown; error: null }) => void = () => {};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  from.mockImplementation(() => {
    const builder: Record<string, unknown> = {
      maybeSingle: () => new Promise((resolve) => (releaseProfile = resolve)),
    };
    for (const method of ['select', 'eq']) builder[method] = () => builder;
    return builder;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  getUser.mockReset();
  from.mockReset();
  vi.mocked(getFullTaskHistory).mockReset();
});

const page = (mes?: string) => ProgresoPage({ searchParams: Promise.resolve(mes ? { mes } : {}) } as never);

describe('Progreso', () => {
  it('reads the task history at the same time as the profile, up to the latest date on Earth', async () => {
    vi.mocked(getFullTaskHistory).mockResolvedValue([]);

    const result = page();
    await new Promise((resolve) => setImmediate(resolve));

    // The profile hasn't answered yet, and the history is already being read.
    expect(getFullTaskHistory).toHaveBeenCalledWith(expect.anything(), 'u1', '2026-09-25');
    releaseProfile({ data: { timezone: 'America/Mexico_City' }, error: null });
    await result;
  });

  it("shows exactly the tasks up to the person's own today (later dates are cut)", async () => {
    vi.mocked(getFullTaskHistory).mockResolvedValue([
      { task_date: '2026-09-23', completed: true },
      { task_date: '2026-09-24', completed: true },
      // Already "tomorrow" for someone in Mexico City: must not count.
      { task_date: '2026-09-25', completed: true },
    ]);

    const result = page();
    await new Promise((resolve) => setImmediate(resolve));
    releaseProfile({ data: { timezone: 'America/Mexico_City' }, error: null });
    const html = renderToString(await result);

    // Two fulfilled days (Sep 23 and 24), not three.
    expect(html).toMatch(/D[^<]*as cumplidos<\/h2><p[^>]*>2<\/p>/);
  });

  it('shows the friendly message, without failing, when the profile has no time zone', async () => {
    vi.mocked(getFullTaskHistory).mockResolvedValue([{ task_date: '2026-09-23', completed: true }]);

    const result = page();
    await new Promise((resolve) => setImmediate(resolve));
    releaseProfile({ data: { timezone: null }, error: null });
    const html = renderToString(await result);

    expect(html).not.toContain('Días cumplidos');
  });
});
