import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// The daily cron end to end, against an in-memory database that behaves like the real one
// where it matters: one message per person per day (messages_one_per_day), and the email
// claim (email_claimed_at) as a single "update … where … returning" operation. The AI, the
// tasks and insight generators and the email are simulated: nothing real is called or sent.
vi.mock('@/lib/messages/generate', () => ({ generateMessage: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendDailyEmail: vi.fn() }));
vi.mock('@/lib/tasks/daily', () => ({ prepareDailyTasks: vi.fn() }));
vi.mock('@/lib/tasks/save', () => ({ saveDailyTasks: vi.fn() }));
vi.mock('@/lib/insights/daily', () => ({ prepareDailyInsight: vi.fn() }));
vi.mock('@/lib/insights/save', () => ({ saveDailyInsight: vi.fn() }));

type Row = Record<string, unknown>;
const db: {
  profiles: Row[];
  messages: Row[];
  daily_tasks: Row[];
  email_log: Row[];
  failInserts: boolean;
} = { profiles: [], messages: [], daily_tasks: [], email_log: [], failInserts: false };
const profileFilters: unknown[][] = [];

type Filter = [string, unknown];

// A tiny PostgREST-like query over `db`.
class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Filter[] = [];
  private orExpr: string | null = null;
  private mode: 'select' | 'insert' | 'update' = 'select';
  private payload: Row = {};
  private returning = false;
  private orderCol: string | null = null;
  private ascending = true;
  private limitN: number | null = null;

  constructor(private table: keyof typeof db) {}

  select() {
    if (this.mode !== 'select') this.returning = true;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    if (this.table === 'profiles') profileFilters.push([column, value]);
    return this;
  }
  or(expr: string) {
    this.orExpr = expr;
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderCol = column;
    this.ascending = options?.ascending !== false;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  insert(row: Row) {
    this.mode = 'insert';
    this.payload = row;
    return this;
  }
  update(values: Row) {
    this.mode = 'update';
    this.payload = values;
    return this;
  }
  single() {
    return this.run().then(({ data, error }) => ({ data: Array.isArray(data) ? (data[0] ?? null) : data, error }));
  }
  maybeSingle() {
    return this.single();
  }
  then<A = { data: unknown; error: unknown }, B = never>(
    resolve?: ((value: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    reject?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return this.run().then(resolve, reject);
  }

  private matches(row: Row): boolean {
    if (!this.filters.every(([column, value]) => row[column] === value)) return false;
    if (!this.orExpr) return true;
    // Only what the cron uses: "col.is.null,col.lt.<iso>".
    return this.orExpr.split(',').some((part) => {
      const [column, op, ...rest] = part.split('.');
      const value = rest.join('.');
      if (op === 'is' && value === 'null') return row[column] == null;
      if (op === 'lt') return row[column] != null && String(row[column]) < value;
      throw new Error(`filtro no soportado en la prueba: ${part}`);
    });
  }

  private async run(): Promise<{ data: unknown; error: unknown }> {
    const rows = (db[this.table] as Row[]) ?? [];
    if (this.mode === 'insert') {
      if (this.table === 'messages') {
        if (db.failInserts) return { data: null, error: { code: 'XX000', message: 'db down' } };
        const p = this.payload;
        if (rows.some((m) => m.user_id === p.user_id && m.message_date === p.message_date)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "messages_one_per_day"' } };
        }
        const row = { id: `m${rows.length + 1}`, generated_at: new Date().toISOString(), email_claimed_at: null, sent_at: null, ...p };
        rows.push(row);
        return { data: this.returning ? [row] : null, error: null };
      }
      rows.push({ ...this.payload });
      return { data: null, error: null };
    }
    if (this.mode === 'update') {
      const hit = rows.filter((row) => this.matches(row));
      for (const row of hit) Object.assign(row, this.payload);
      return { data: this.returning ? hit.map((row) => ({ ...row })) : null, error: null };
    }
    let found = rows.filter((row) => this.matches(row));
    if (this.orderCol) {
      const col = this.orderCol;
      found = [...found].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (this.ascending ? 1 : -1));
    }
    if (this.limitN !== null) found = found.slice(0, this.limitN);
    return { data: found.map((row) => ({ ...row })), error: null };
  }
}

function fakeAdmin() {
  return {
    from: (table: string) => new Query((table in db ? table : 'email_log') as keyof typeof db),
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@ejemplo.invalid` } } }) } },
  };
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdmin() }));

const { GET } = await import('./route');
const { generateMessage } = await import('@/lib/messages/generate');
const { sendDailyEmail } = await import('@/lib/email/send');
const { prepareDailyTasks } = await import('@/lib/tasks/daily');
const { saveDailyTasks } = await import('@/lib/tasks/save');
const { prepareDailyInsight } = await import('@/lib/insights/daily');

const profile = (id: string, hour: number, extra: Row = {}): Row => ({
  id,
  name: id,
  current_age: 30,
  future_self_age: 40,
  values: '',
  focus_area: 'paz',
  tone: 'tierno',
  delivery_hour_local: hour,
  timezone: 'America/Mexico_City',
  onboarding_completed: true,
  current_energy_summary: null,
  blocking_pattern: null,
  future_vision: null,
  delivery_paused: false,
  created_at: '',
  updated_at: '',
  ...extra,
});

// A message already saved for Ana today (Oct 4 in Mexico City), e.g. created by the app.
const todaysMessage = (extra: Row = {}): Row => ({
  id: 'hoy',
  user_id: 'ana',
  content: 'Mensaje que ya existía.',
  model_used: 'claude-sonnet-5',
  generated_at: '2026-10-04T12:30:00Z',
  message_date: '2026-10-04',
  send_status: 'pending',
  sent_at: null,
  email_claimed_at: null,
  ...extra,
});

const request = () =>
  GET(new NextRequest('http://localhost/api/cron/send-messages', { headers: { authorization: 'Bearer secreto' } }));

async function runAt(iso: string) {
  vi.setSystemTime(new Date(iso));
  return (await (await request()).json()) as { processed: number; succeeded: number; failed: number };
}

const sentTo = () => vi.mocked(sendDailyEmail).mock.calls.map((call) => call[0]);
const sentText = (i = 0) => vi.mocked(sendDailyEmail).mock.calls[i][1];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubEnv('CRON_SECRET', 'secreto');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db.profiles = [];
  db.messages = [];
  db.daily_tasks = [];
  db.email_log = [];
  db.failInserts = false;
  profileFilters.length = 0;
  vi.mocked(generateMessage).mockResolvedValue({ content: 'Tu mensaje de hoy.', modelUsed: 'claude-sonnet-5' });
  vi.mocked(sendDailyEmail).mockResolvedValue({ providerId: 'p1', status: 'sent', error: null });
  vi.mocked(prepareDailyTasks).mockResolvedValue(null);
  vi.mocked(prepareDailyInsight).mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.mocked(generateMessage).mockReset();
  vi.mocked(sendDailyEmail).mockReset();
  vi.mocked(prepareDailyTasks).mockReset();
  vi.mocked(saveDailyTasks).mockReset();
  vi.mocked(prepareDailyInsight).mockReset();
});

// 2026-10-04T14:00Z is 08:00 in Mexico City (UTC-6).
describe("today's message already exists (for example, the app created it)", () => {
  it('sends THAT message with its saved tasks, without generating anything', async () => {
    db.profiles = [profile('ana', 8)];
    db.messages = [todaysMessage()];
    db.daily_tasks = [
      { user_id: 'ana', task_date: '2026-10-04', position: 2, description: 'Tarea dos.' },
      { user_id: 'ana', task_date: '2026-10-04', position: 1, description: 'Tarea uno.' },
    ];

    expect(await runAt('2026-10-04T14:20:00Z')).toEqual({ processed: 1, succeeded: 1, failed: 0 });

    expect(generateMessage).not.toHaveBeenCalled();
    expect(prepareDailyTasks).not.toHaveBeenCalled();
    expect(prepareDailyInsight).not.toHaveBeenCalled();
    expect(sentTo()).toEqual(['ana@ejemplo.invalid']);
    expect(sentText()).toContain('Mensaje que ya existía.');
    expect(sentText()).toContain('1. Tarea uno.\n2. Tarea dos.');
    expect(db.messages).toHaveLength(1);
    expect(db.messages[0]).toMatchObject({ send_status: 'sent', email_claimed_at: '2026-10-04T14:20:00.000Z' });
  });

  it('without saved tasks, prepares them from that same message and saves them', async () => {
    db.profiles = [profile('ana', 8)];
    db.messages = [todaysMessage()];
    vi.mocked(prepareDailyTasks).mockResolvedValue({ taskDate: '2026-10-04', tasks: ['Nueva uno.', 'Nueva dos.', 'Nueva tres.'] });

    await runAt('2026-10-04T14:20:00Z');

    expect(generateMessage).not.toHaveBeenCalled();
    expect(vi.mocked(prepareDailyTasks).mock.calls[0][3]).toBe('Mensaje que ya existía.');
    expect(sentText()).toContain('1. Nueva uno.');
    expect(saveDailyTasks).toHaveBeenCalledWith('ana', '2026-10-04', ['Nueva uno.', 'Nueva dos.', 'Nueva tres.'], expect.anything());
  });

  it('two runs at the same time send exactly one email', async () => {
    db.profiles = [profile('ana', 8)];
    db.messages = [todaysMessage()];
    vi.setSystemTime(new Date('2026-10-04T14:45:00Z'));

    const [first, second] = await Promise.all([request(), request()]);

    expect(sentTo()).toEqual(['ana@ejemplo.invalid']);
    expect(generateMessage).not.toHaveBeenCalled();
    expect(await first.json()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(await second.json()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
  });

  it("a claim left by a crashed run is taken over after 15 minutes, never before", async () => {
    db.profiles = [profile('ana', 8)];

    // Claimed 5 minutes ago and still pending: that run may still be sending. Nothing now.
    db.messages = [todaysMessage({ email_claimed_at: '2026-10-04T14:15:00Z' })];
    expect(await runAt('2026-10-04T14:20:00Z')).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(sendDailyEmail).not.toHaveBeenCalled();

    // An hour later it is still pending: that run crashed. This one takes it over and sends it.
    expect(await runAt('2026-10-04T15:20:00Z')).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(sentTo()).toEqual(['ana@ejemplo.invalid']);
  });

  it.each(['sent', 'failed'])('an email already %s today is never sent again', async (status) => {
    db.profiles = [profile('ana', 8)];
    db.messages = [todaysMessage({ send_status: status, email_claimed_at: '2026-10-04T14:05:00Z' })];

    expect(await runAt('2026-10-04T15:20:00Z')).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(sendDailyEmail).not.toHaveBeenCalled();
    expect(generateMessage).not.toHaveBeenCalled();
  });
});

describe("today's message doesn't exist yet", () => {
  it('creates it, saves it already claimed with its local day, and sends it with its tasks and insight', async () => {
    db.profiles = [profile('ana', 8)];

    expect(await runAt('2026-10-04T14:20:00Z')).toEqual({ processed: 1, succeeded: 1, failed: 0 });

    expect(generateMessage).toHaveBeenCalledTimes(1);
    expect(prepareDailyTasks).toHaveBeenCalledTimes(1);
    expect(prepareDailyInsight).toHaveBeenCalledTimes(1);
    expect(sentText()).toContain('Tu mensaje de hoy.');
    expect(db.messages).toHaveLength(1);
    expect(db.messages[0]).toMatchObject({
      message_date: '2026-10-04',
      email_claimed_at: '2026-10-04T14:20:00.000Z',
      send_status: 'sent',
    });
  });

  it('two runs at once (GitHub and Supabase): one message, one email; neither reports a failure', async () => {
    db.profiles = [profile('ana', 8)];
    vi.setSystemTime(new Date('2026-10-04T14:45:00Z'));

    const [first, second] = await Promise.all([request(), request()]);

    expect(db.messages).toHaveLength(1);
    expect(sentTo()).toEqual(['ana@ejemplo.invalid']);
    expect(prepareDailyTasks).toHaveBeenCalledTimes(1);
    expect(await first.json()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(await second.json()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
  });

  it('when the AI fails both attempts it counts as failed, saves nothing and sends nothing', async () => {
    db.profiles = [profile('ana', 8)];
    vi.mocked(generateMessage).mockRejectedValue(new Error('overloaded'));

    expect(await runAt('2026-10-04T14:20:00Z')).toEqual({ processed: 1, succeeded: 0, failed: 1 });
    expect(generateMessage).toHaveBeenCalledTimes(2);
    expect(db.messages).toHaveLength(0);
    expect(sendDailyEmail).not.toHaveBeenCalled();
  });

  it('any other save error is still a failure', async () => {
    db.profiles = [profile('ana', 8)];
    db.failInserts = true;

    expect(await runAt('2026-10-04T14:20:00Z')).toEqual({ processed: 1, succeeded: 0, failed: 1 });
    expect(sendDailyEmail).not.toHaveBeenCalled();
  });
});

describe('same-day recovery (up to 4 hours)', () => {
  it('a person whose run failed 1 hour ago is recovered in the next run', async () => {
    db.profiles = [profile('ana', 8)];

    vi.mocked(generateMessage).mockRejectedValue(new Error('overloaded'));
    expect(await runAt('2026-10-04T14:05:00Z')).toEqual({ processed: 1, succeeded: 0, failed: 1 });

    vi.mocked(generateMessage).mockResolvedValue({ content: 'Tu mensaje de hoy.', modelUsed: 'claude-sonnet-5' });
    expect(await runAt('2026-10-04T15:05:00Z')).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(sentTo()).toEqual(['ana@ejemplo.invalid']);
  });

  it('a person whose hour was 5 hours ago is not taken', async () => {
    db.profiles = [profile('ana', 8)];

    expect(await runAt('2026-10-04T19:05:00Z')).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    expect(generateMessage).not.toHaveBeenCalled();
  });

  it('a whole morning of runs (08:00 to 12:00) sends exactly one email', async () => {
    db.profiles = [profile('ana', 8)];

    for (const hour of ['14', '15', '16', '17', '18']) await runAt(`2026-10-04T${hour}:05:00Z`);

    expect(sentTo()).toEqual(['ana@ejemplo.invalid']);
    expect(generateMessage).toHaveBeenCalledTimes(1);
  });

  it('starts over at local midnight: a late-night hour missed yesterday is not sent after midnight', async () => {
    db.profiles = [profile('noctambula', 23)];

    expect(await runAt('2026-10-05T07:30:00Z')).toEqual({ processed: 0, succeeded: 0, failed: 0 });
  });

  it("yesterday's message doesn't count as today's", async () => {
    db.profiles = [profile('ana', 8)];
    db.messages = [todaysMessage({ id: 'ayer', message_date: '2026-10-03', generated_at: '2026-10-03T14:06:00Z', send_status: 'sent' })];

    expect(await runAt('2026-10-04T14:05:00Z')).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(sentTo()).toEqual(['ana@ejemplo.invalid']);
    expect(generateMessage).toHaveBeenCalledTimes(1);
  });
});

describe('who is taken', () => {
  it('paused people get no email (and nothing is generated for them by the cron)', async () => {
    db.profiles = [profile('pausada', 8, { delivery_paused: true })];
    db.messages = [todaysMessage({ user_id: 'pausada' })];

    expect(await runAt('2026-10-04T14:20:00Z')).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    expect(sendDailyEmail).not.toHaveBeenCalled();
    expect(generateMessage).not.toHaveBeenCalled();
  });

  it('only profiles with the onboarding finished are read', async () => {
    await runAt('2026-10-04T14:05:00Z');

    expect(profileFilters).toContainEqual(['onboarding_completed', true]);
  });
});
