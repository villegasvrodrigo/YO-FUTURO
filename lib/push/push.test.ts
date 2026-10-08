import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pushClientConfig, pushEnabled } from './config';
import { dailyPushPayload, sendPushToUser } from './send';
import { createMemoryDb, memoryAdminClient, type MemoryDb } from '@/lib/testing/memoryDb';

const turnOn = (withKeys = true) => {
  vi.stubEnv('PUSH_ENABLED', 'true');
  vi.stubEnv('VAPID_PUBLIC_KEY', withKeys ? 'BPublica' : '');
  vi.stubEnv('VAPID_PRIVATE_KEY', withKeys ? 'privada' : '');
};

beforeEach(() => {
  vi.stubEnv('PUSH_ENABLED', undefined);
  vi.stubEnv('VAPID_PUBLIC_KEY', undefined);
  vi.stubEnv('VAPID_PRIVATE_KEY', undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the switch', () => {
  it('is off without PUSH_ENABLED, or with any value but "true"', () => {
    expect(pushEnabled()).toBe(false);
    for (const value of ['false', '', '1', 'si']) {
      vi.stubEnv('PUSH_ENABLED', value);
      vi.stubEnv('VAPID_PUBLIC_KEY', 'BPublica');
      vi.stubEnv('VAPID_PRIVATE_KEY', 'privada');
      expect(pushEnabled()).toBe(false);
    }
  });

  it('stays off when it is "true" but the keys are missing', () => {
    turnOn(false);

    expect(pushEnabled()).toBe(false);
    expect(pushClientConfig()).toEqual({ enabled: false, publicKey: '' });
  });

  it('is on with "true" and both keys, and gives the browser only the public key', () => {
    turnOn();

    expect(pushEnabled()).toBe(true);
    expect(pushClientConfig()).toEqual({ enabled: true, publicKey: 'BPublica' });
  });
});

describe('dailyPushPayload', () => {
  it('"{Nombre}, tu yo futuro te escribió", opening Inicio, never the message', () => {
    expect(dailyPushPayload('Rodrigo')).toEqual({
      title: 'Yo Futuro',
      body: 'Rodrigo, tu yo futuro te escribió',
      url: '/dashboard',
      tag: 'mensaje-del-dia',
    });
    expect(dailyPushPayload('  ').body).toBe('Tu yo futuro te escribió');
  });
});

describe('sendPushToUser', () => {
  let db: MemoryDb;
  const phone = (id: string, userId = 'ana') => ({ id, user_id: userId, endpoint: `https://push.ejemplo/${id}`, p256dh: 'k', auth: 'a' });

  beforeEach(() => {
    db = createMemoryDb();
    db.tables.push_subscriptions = [phone('cel1'), phone('cel2'), phone('otro', 'bruno')];
  });

  it('does nothing at all while off (no read, no send)', async () => {
    const send = vi.fn();

    expect(await sendPushToUser(memoryAdminClient(db) as never, 'ana', dailyPushPayload('Ana'), send)).toEqual({ sent: 0, removed: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('does nothing when on but without keys', async () => {
    turnOn(false);
    const send = vi.fn();

    await sendPushToUser(memoryAdminClient(db) as never, 'ana', dailyPushPayload('Ana'), send);

    expect(send).not.toHaveBeenCalled();
  });

  it("sends to every phone of the person (and nobody else's), and records the success", async () => {
    turnOn();
    const send = vi.fn().mockResolvedValue({ statusCode: 201 });

    const result = await sendPushToUser(memoryAdminClient(db) as never, 'ana', dailyPushPayload('Ana'), send);

    expect(result).toEqual({ sent: 2, removed: 0, failed: 0 });
    expect(send.mock.calls.map((call) => call[0].endpoint).sort()).toEqual(['https://push.ejemplo/cel1', 'https://push.ejemplo/cel2']);
    expect(JSON.parse(send.mock.calls[0][1])).toMatchObject({ body: 'Ana, tu yo futuro te escribió' });
    expect(db.tables.push_subscriptions.filter((r) => r.user_id === 'ana').every((r) => r.last_success_at)).toBe(true);
  });

  it('deletes a phone that no longer accepts notices (404/410), and keeps the rest', async () => {
    turnOn();
    const send = vi.fn(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith('cel1')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      return { statusCode: 201 };
    });

    const result = await sendPushToUser(memoryAdminClient(db) as never, 'ana', dailyPushPayload('Ana'), send);

    expect(result).toEqual({ sent: 1, removed: 1, failed: 0 });
    expect(db.tables.push_subscriptions.map((r) => r.id).sort()).toEqual(['cel2', 'otro']);
  });

  it('never throws: any other failure is counted and logged without personal data', async () => {
    turnOn();
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));

    const result = await sendPushToUser(memoryAdminClient(db) as never, 'ana', dailyPushPayload('Ana'), send);

    expect(result).toEqual({ sent: 0, removed: 0, failed: 2 });
    expect(db.tables.push_subscriptions).toHaveLength(3);
    const logs = vi.mocked(console.error).mock.calls.flat().join(' ');
    expect(logs).not.toContain('Ana');
    expect(logs).not.toContain('push.ejemplo');
  });
});

describe('the service worker (public/sw.js)', () => {
  const sw = readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');

  it('only shows the notice and opens Inicio on a tap', () => {
    expect(sw).toContain("addEventListener('push'");
    expect(sw).toContain("addEventListener('notificationclick'");
    expect(sw).toContain("'/dashboard'");
  });

  it('never caches anything (no fetch handler, no Cache API), so the app is never served old', () => {
    expect(sw).not.toContain("addEventListener('fetch'");
    expect(sw).not.toMatch(/caches\./);
  });
});
