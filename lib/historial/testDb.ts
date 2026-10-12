// For tests only: a tiny in-memory stand-in for the user's Supabase client, with just the
// reads the history makes (eq, lt, gt, lte, gte, order, limit, maybeSingle). `failTables`
// makes every read of those tables answer with an error.

type Row = Record<string, unknown>;

export interface HistoryTestDb {
  messages: Row[];
  daily_tasks: Row[];
  daily_insights: Row[];
  failTables: Set<string>;
}

export function createHistoryTestDb(): HistoryTestDb {
  return { messages: [], daily_tasks: [], daily_insights: [], failTables: new Set() };
}

type Result = { data: unknown; error: { message: string } | null };

class Read implements PromiseLike<Result> {
  private tests: ((row: Row) => boolean)[] = [];
  private orderCol: string | null = null;
  private ascending = true;
  private limitN: number | null = null;

  constructor(
    private db: HistoryTestDb,
    private table: string
  ) {}

  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.tests.push((row) => row[column] === value);
    return this;
  }
  lt(column: string, value: string) {
    this.tests.push((row) => String(row[column]) < value);
    return this;
  }
  gt(column: string, value: string) {
    this.tests.push((row) => String(row[column]) > value);
    return this;
  }
  lte(column: string, value: string) {
    this.tests.push((row) => String(row[column]) <= value);
    return this;
  }
  gte(column: string, value: string) {
    this.tests.push((row) => String(row[column]) >= value);
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
  maybeSingle() {
    return this.run().then(({ data, error }) => ({ data: Array.isArray(data) ? (data[0] ?? null) : data, error }));
  }
  then<A = Result, B = never>(
    resolve?: ((value: Result) => A | PromiseLike<A>) | null,
    reject?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return this.run().then(resolve, reject);
  }

  private async run(): Promise<Result> {
    await Promise.resolve();
    if (this.db.failTables.has(this.table)) return { data: null, error: { message: `${this.table} no responde` } };
    const table = (this.db as unknown as Record<string, Row[]>)[this.table] ?? [];
    let rows = table.filter((row) => this.tests.every((test) => test(row)));
    if (this.orderCol) {
      const col = this.orderCol;
      rows = [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (this.ascending ? 1 : -1));
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    return { data: rows.map((row) => ({ ...row })), error: null };
  }
}

/** The fake client over `db`; cast it to SupabaseClient where needed. */
export function historyTestClient(db: HistoryTestDb) {
  return { from: (table: string) => new Read(db, table) };
}
