import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryDb, memoryAdminClient, type MemoryDb } from '@/lib/testing/memoryDb';
import { TEST_PUSH_KEY, testPushPayload } from './limit';

// The push service is simulated: nothing real is sent.
const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...args: unknown[]) => sendNotification(...args) } }));
let db: MemoryDb;
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => memoryAdminClient(db) }));
let signedIn: string | null;
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: signedIn ? { id: signedIn, app_metadata: db.users[signedIn]?.app_metadata ?? {} } : null },
      }),
    },
  }),
}));

const { POST } = await import('./route');

const phone = (id: string, userId: string) => ({ id, user_id: userId, endpoint: `https://web.push.apple.com/${id}`, p256dh: 'k', auth: 'a' });
const call = async () => {
  const res = await POST();
  return { code: res.status, status: ((await res.json()) as { status: string }).status };
};
const sentTo = () => sendNotification.mock.calls.map(([sub]) => (sub as { endpoint: string }).endpoint);

beforeEach(() => {
  db = createMemoryDb();
  db.tables.profiles.push({ id: 'ana', name: 'Ana', timezone: 'America/Mexico_City' });
  db.users.ana = { email: 'ana@ejemplo.invalid', app_metadata: {} };
  db.tables.push_subscriptions.push(phone('iphone-ana', 'ana'), phone('ipad-ana', 'ana'), phone('iphone-beto', 'beto'));
  signedIn = 'ana';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T18:00:00Z')); // 12:00 in Mexico City
  vi.stubEnv('PUSH_ENABLED', 'true');
  vi.stubEnv('VAPID_PUBLIC_KEY', 'BPublica');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'privada');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sendNotification.mockResolvedValue({ statusCode: 201 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  sendNotification.mockReset();
});

describe('the test notice text', () => {
  it('"{Nombre}, así se verá tu aviso diario", and it opens Inicio', () => {
    expect(testPushPayload('  Ana ')).toEqual({
      title: 'Yo Futuro',
      body: 'Ana, así se verá tu aviso diario',
      url: '/dashboard',
      tag: 'aviso-de-prueba',
    });
    expect(testPushPayload(null).body).toBe('Así se verá tu aviso diario');
  });
});

describe('POST /api/push/prueba', () => {
  it('sends it only to the phones of the signed-in person', async () => {
    expect(await call()).toEqual({ code: 200, status: 'enviado' });

    expect(sentTo().sort()).toEqual(['https://web.push.apple.com/ipad-ana', 'https://web.push.apple.com/iphone-ana']);
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toEqual(testPushPayload('Ana'));
  });

  it('at most 5 per person per day; the 6th is refused without sending', async () => {
    for (let i = 0; i < 5; i++) expect((await call()).status).toBe('enviado');
    sendNotification.mockClear();

    expect(await call()).toEqual({ code: 429, status: 'limite' });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('the limit starts over on the person’s next day', async () => {
    db.users.ana.app_metadata = { [TEST_PUSH_KEY]: { date: '2026-10-07', sent: 5 } };

    expect((await call()).status).toBe('enviado');
    expect(db.users.ana.app_metadata[TEST_PUSH_KEY]).toEqual({ date: '2026-10-08', sent: 1 });
  });

  it('a failed send still counts toward the limit and shows as an error', async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));

    expect(await call()).toEqual({ code: 502, status: 'error' });
    expect(db.users.ana.app_metadata[TEST_PUSH_KEY]).toEqual({ date: '2026-10-08', sent: 1 });
  });

  it('only reads the phones: never changes or deletes them, even one that no longer works', async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));
    const before = structuredClone(db.tables.push_subscriptions);

    await call();

    expect(db.tables.push_subscriptions).toEqual(before);
  });

  it('without phones of hers: nothing is sent or counted', async () => {
    signedIn = 'carla';
    db.users.carla = { email: 'carla@ejemplo.invalid', app_metadata: {} };

    expect(await call()).toEqual({ code: 409, status: 'sin-telefono' });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(db.users.carla.app_metadata).toEqual({});
  });

  it('needs a session', async () => {
    signedIn = null;

    expect((await call()).code).toBe(401);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('does nothing while notifications are off or without the keys', async () => {
    vi.stubEnv('PUSH_ENABLED', 'false');
    expect((await call()).code).toBe(404);

    vi.stubEnv('PUSH_ENABLED', 'true');
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    expect((await call()).code).toBe(404);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
