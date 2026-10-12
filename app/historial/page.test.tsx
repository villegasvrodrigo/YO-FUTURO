import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createHistoryTestDb, historyTestClient, type HistoryTestDb } from '@/lib/historial/testDb';

const getUser = vi.fn();
let db: HistoryTestDb;
let profile: Record<string, unknown> | null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => {
      if (table !== 'profiles') return historyTestClient(db).from(table);
      const builder: Record<string, unknown> = { maybeSingle: async () => ({ data: profile, error: null }) };
      for (const method of ['select', 'eq']) builder[method] = () => builder;
      return builder;
    },
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  usePathname: () => '/historial',
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

const { default: HistorialPage } = await import('./page');

// 2026-10-12 03:00 UTC: still Oct 11 in Mexico City.
const NOW = new Date('2026-10-12T03:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  db = createHistoryTestDb();
  profile = { timezone: 'America/Mexico_City', delivery_hour_local: 7, delivery_paused: false };
  db.messages.push(
    { user_id: 'u1', message_date: '2026-10-05', content: 'Mensaje del 5' },
    { user_id: 'u1', message_date: '2026-10-09', content: 'Mensaje del 9' },
    // Today in Mexico City.
    { user_id: 'u1', message_date: '2026-10-11', content: 'Mensaje de hoy' }
  );
  db.daily_tasks.push({ id: 't1', user_id: 'u1', task_date: '2026-10-09', position: 1, description: 'Caminar', completed: true });
  db.daily_insights.push({ user_id: 'u1', insight_date: '2026-10-09', content: 'Insight del 9' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  getUser.mockReset();
});

const page = (dia?: string) => HistorialPage({ searchParams: Promise.resolve(dia === undefined ? {} : { dia }) } as never);
const html = async (dia?: string) => renderToString(await page(dia));

describe('Historial', () => {
  it('sends a signed-out visit to the login', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(page('2026-10-09')).rejects.toThrow('redirect:/login');
  });

  it("shows the requested day whole: message, tasks and insight, with arrows to its neighbors", async () => {
    const out = await html('2026-10-09');

    expect(out).toContain('Mensaje del 9');
    expect(out).toContain('Caminar');
    expect(out).toContain('Insight del 9');
    expect(out).toContain('href="/historial?dia=2026-10-05"');
    expect(out).toContain('href="/historial?dia=2026-10-11"');
    // The bottom bar is there, so the installed app never leaves the person stuck.
    expect(out).toContain('href="/progreso"');
  });

  it('with no date, goes to the latest day up to today', async () => {
    await expect(page()).rejects.toThrow('redirect:/historial?dia=2026-10-11');
  });

  it("uses the person's today: in UTC it is already Oct 12, in Mexico City it isn't", async () => {
    db.messages.push({ user_id: 'u1', message_date: '2026-10-12', content: 'Mañana' });
    await expect(page()).rejects.toThrow('redirect:/historial?dia=2026-10-11');
    await expect(page('2026-10-12')).rejects.toThrow('redirect:/historial?dia=2026-10-11');
  });

  it.each(['ayer', '2026-02-31', '2027-01-01'])('an invalid or future date (%s) goes to the latest day', async (dia) => {
    await expect(page(dia)).rejects.toThrow('redirect:/historial?dia=2026-10-11');
  });

  it('a day with nothing goes to the closest day with something', async () => {
    await expect(page('2026-10-06')).rejects.toThrow('redirect:/historial?dia=2026-10-05');
    await expect(page('2026-10-08')).rejects.toThrow('redirect:/historial?dia=2026-10-09');
    await expect(page('2026-01-01')).rejects.toThrow('redirect:/historial?dia=2026-10-05');
  });

  it('with nothing at all yet, shows the friendly message', async () => {
    db = createHistoryTestDb();
    const out = await html();

    expect(out).toContain('todavía no te ha escrito');
    expect(out).toContain('7:00 de America/Mexico_City');
  });

  it('a failed read shows a notice for that day, without breaking the screen', async () => {
    db.failTables.add('daily_tasks');
    const out = await html('2026-10-09');

    expect(out).toContain('No se pudo cargar este día');
    expect(console.error).toHaveBeenCalled();
  });

  it('with an invalid time zone, uses the fallback one instead of failing', async () => {
    profile = { timezone: 'Nada/Nada', delivery_hour_local: 7, delivery_paused: false };
    await expect(page()).rejects.toThrow(/redirect:\/historial\?dia=2026-10-1[01]/);
  });
});
