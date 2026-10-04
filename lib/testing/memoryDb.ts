// For tests only: an in-memory stand-in for the Supabase admin client, behaving like the real
// database where the daily flow depends on it — one message per person per day
// (messages_one_per_day), one task per person, day and position, and "update … where …
// returning" as a single operation (the email claim). Plus the auth admin calls the app uses.

export type Row = Record<string, unknown>;

export interface MemoryDb {
  tables: Record<string, Row[]>;
  users: Record<string, { email: string; app_metadata: Record<string, unknown> }>;
  failInserts: boolean;
}

export function createMemoryDb(): MemoryDb {
  return { tables: { profiles: [], messages: [], goals: [], daily_tasks: [], daily_insights: [], email_log: [] }, users: {}, failInserts: false };
}

type Result = { data: unknown; error: unknown };

// Unique rules, as in the real database.
const UNIQUE: Record<string, string[]> = {
  messages: ['user_id', 'message_date'],
  daily_tasks: ['user_id', 'task_date', 'position'],
  daily_insights: ['user_id', 'insight_date'],
};

class Query implements PromiseLike<Result> {
  private filters: [string, unknown][] = [];
  private ranges: [string, 'lt' | 'lte' | 'gte', unknown][] = [];
  private orExpr: string | null = null;
  private mode: 'select' | 'insert' | 'update' = 'select';
  private payload: Row | Row[] = {};
  private returning = false;
  private orderCol: string | null = null;
  private ascending = true;
  private limitN: number | null = null;

  constructor(
    private db: MemoryDb,
    private table: string
  ) {}

  select() {
    if (this.mode !== 'select') this.returning = true;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  lt(column: string, value: unknown) {
    this.ranges.push([column, 'lt', value]);
    return this;
  }
  lte(column: string, value: unknown) {
    this.ranges.push([column, 'lte', value]);
    return this;
  }
  gte(column: string, value: unknown) {
    this.ranges.push([column, 'gte', value]);
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
  range() {
    return this;
  }
  insert(rows: Row | Row[]) {
    this.mode = 'insert';
    this.payload = rows;
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
  then<A = Result, B = never>(
    resolve?: ((value: Result) => A | PromiseLike<A>) | null,
    reject?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return this.run().then(resolve, reject);
  }

  private rows(): Row[] {
    return (this.db.tables[this.table] ??= []);
  }

  private matches(row: Row): boolean {
    if (!this.filters.every(([column, value]) => row[column] === value)) return false;
    for (const [column, op, value] of this.ranges) {
      const a = String(row[column]);
      const b = String(value);
      if (op === 'lt' && !(a < b)) return false;
      if (op === 'lte' && !(a <= b)) return false;
      if (op === 'gte' && !(a >= b)) return false;
    }
    if (!this.orExpr) return true;
    return this.orExpr.split(',').some((part) => {
      const [column, op, ...rest] = part.split('.');
      const value = rest.join('.');
      if (op === 'is' && value === 'null') return row[column] == null;
      if (op === 'lt') return row[column] != null && String(row[column]) < value;
      throw new Error(`filtro no soportado en la base simulada: ${part}`);
    });
  }

  private async run(): Promise<Result> {
    // Let other queries interleave, as with a real network round trip.
    await Promise.resolve();
    const rows = this.rows();
    if (this.mode === 'insert') {
      if (this.table === 'messages' && this.db.failInserts) return { data: null, error: { code: 'XX000', message: 'db down' } };
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
      const keys = UNIQUE[this.table];
      if (keys) {
        const clash = incoming.some((row) => rows.some((existing) => keys.every((k) => existing[k] === row[k])));
        if (clash) return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint on ${this.table}` } };
      }
      const added = incoming.map((row, i) => ({
        id: `${this.table}-${rows.length + i + 1}`,
        ...(this.table === 'messages' ? { generated_at: new Date().toISOString(), email_claimed_at: null, sent_at: null } : {}),
        ...row,
      }));
      rows.push(...added);
      return { data: this.returning ? added.map((row) => ({ ...row })) : null, error: null };
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

/** The fake admin client over `db`. */
export function memoryAdminClient(db: MemoryDb) {
  return {
    from: (table: string) => new Query(db, table),
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: db.users[id] ? { id, email: db.users[id].email, app_metadata: db.users[id].app_metadata } : null },
          error: null,
        }),
        updateUserById: async (id: string, attrs: { app_metadata?: Record<string, unknown> }) => {
          const user = (db.users[id] ??= { email: `${id}@ejemplo.invalid`, app_metadata: {} });
          // Like Supabase: app_metadata keys are merged.
          user.app_metadata = { ...user.app_metadata, ...(attrs.app_metadata ?? {}) };
          return { data: { user: { id, app_metadata: user.app_metadata } }, error: null };
        },
      },
    },
  };
}
