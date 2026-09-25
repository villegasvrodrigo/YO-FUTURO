import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';

const getUser = vi.fn();
const from = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser }, from }) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  usePathname: () => '/perfil',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { default: PerfilPage } = await import('./page');

type Result = { data: unknown; error: { message: string } | null };

// Each table answers when the test says so, and records when its query started.
function deferredTables() {
  const started: string[] = [];
  const releases: Record<string, (result: Result) => void> = {};
  const pending: Record<string, Promise<Result>> = {};
  for (const table of ['profiles', 'goals']) pending[table] = new Promise((resolve) => (releases[table] = resolve));
  from.mockImplementation((table: string) => {
    const builder: Record<string, unknown> = {
      then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => {
        started.push(table);
        return pending[table].then(resolve, reject);
      },
      single: () => {
        started.push(table);
        return pending[table];
      },
    };
    for (const method of ['select', 'eq']) builder[method] = () => builder;
    return builder;
  });
  return { started, releases };
}

const profile = {
  id: 'u1',
  name: 'Rodrigo',
  current_age: 40,
  future_self_age: 50,
  values: 'La calma',
  focus_area: 'paz',
  tone: 'tierno',
  delivery_hour_local: 8,
  timezone: 'America/Mexico_City',
  onboarding_completed: true,
  current_energy_summary: null,
  blocking_pattern: null,
  future_vision: null,
  delivery_paused: false,
  created_at: '',
  updated_at: '',
};

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

afterEach(() => {
  getUser.mockReset();
  from.mockReset();
});

describe('Perfil', () => {
  it('reads the profile and the goals at the same time, once each', async () => {
    const { started, releases } = deferredTables();

    const page = PerfilPage();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(expect.arrayContaining(['profiles', 'goals']));

    releases.profiles({ data: profile, error: null });
    releases.goals({ data: [{ id: 'g1', user_id: 'u1', description: 'Meditar', status: 'active', created_at: '' }], error: null });
    const html = renderToString(await page);

    expect(started).toHaveLength(2);
    expect(html).toContain('Rodrigo');
    expect(html).toContain('Meditar');
  });

  it('still sends a person without a profile to the onboarding', async () => {
    const { releases } = deferredTables();
    const page = PerfilPage();
    releases.profiles({ data: null, error: null });
    releases.goals({ data: [], error: null });

    await expect(page).rejects.toThrow('redirect:/onboarding');
  });
});
