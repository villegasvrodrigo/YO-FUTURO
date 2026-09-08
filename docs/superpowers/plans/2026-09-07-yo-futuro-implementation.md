# YO FUTURO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the YO FUTURO MVP — a Next.js + Supabase app where users get a daily AI-generated message from their "future self" by email, with profile, goals, and history.

**Architecture:** Next.js App Router app backed by Supabase (Postgres + Auth + RLS). A Vercel Cron job hits an internal API route hourly; that route finds users whose local delivery hour matches now, generates a personalized message via the Claude API, stores it, and emails it via Resend. All business logic (timezone matching, prompt building, API wrappers) is written as small, pure/DI-testable functions with Vitest unit tests; pages are verified manually per the spec's own testing section.

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), `@anthropic-ai/sdk`, `resend`, Vitest, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-09-07-yo-futuro-design.md`

## Global Constraints

- AI model for message generation: `claude-sonnet-5`, called via the official `@anthropic-ai/sdk` (never raw HTTP) — approved during design for cost/quality balance on high-volume daily sends.
- Auth: email + password via Supabase Auth only (no OAuth, no magic link in MVP).
- Notification channel: email only (Resend), no push notifications.
- RLS: users can only read/write their own `profiles` and `goals`, and only read their own `messages`. `email_log` has RLS enabled with no user-facing policies — only the `service_role` key (used by the cron route) can touch it.
- Cron: Vercel Cron invokes the send route hourly; the route is protected by a `CRON_SECRET` bearer token.
- All UI copy and generated messages are in Spanish.
- Out of scope (do not build): push notifications, payment plans, non-Claude AI providers, periodic goal check-ins.

---

## Task 1: Project scaffolding, shared types, test tooling

**Files:**
- Create: whole Next.js project structure (via `create-next-app`)
- Create: `lib/types.ts`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Produces: `Profile`, `Goal`, `MessageRecord`, `FocusArea`, `Tone`, `GoalStatus`, `SendStatus` types from `lib/types.ts`, used by every later task.

- [ ] **Step 1: Scaffold the Next.js app in the current directory**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --no-git
```

If prompted about the directory not being empty, confirm — only `docs/` and `.git/` exist so far and won't conflict.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install @supabase/ssr @supabase/supabase-js @anthropic-ai/sdk resend
```

- [ ] **Step 3: Install dev dependencies and configure Vitest**

```bash
npm install -D vitest
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

Add to `package.json` scripts:

```json
"test": "vitest run"
```

- [ ] **Step 4: Create shared domain types**

Create `lib/types.ts`:

```ts
export type FocusArea = 'carrera' | 'salud' | 'relaciones' | 'finanzas' | 'personal';
export type Tone = 'motivador' | 'exigente' | 'tierno' | 'directo';
export type GoalStatus = 'active' | 'achieved' | 'paused';
export type SendStatus = 'pending' | 'sent' | 'failed';

export interface Profile {
  id: string;
  name: string;
  current_age: number;
  future_self_age: number;
  values: string;
  focus_area: FocusArea;
  tone: Tone;
  delivery_hour_local: number;
  timezone: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  description: string;
  status: GoalStatus;
  created_at: string;
}

export interface MessageRecord {
  id: string;
  user_id: string;
  content: string;
  generated_at: string;
  sent_at: string | null;
  send_status: SendStatus;
  model_used: string;
}
```

- [ ] **Step 5: Verify the project compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Document required environment variables**

Create `.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
CRON_SECRET=
```

Note: `NEXT_PUBLIC_` prefixes are required by Next.js to expose the URL/anon key to the browser bundle; `SUPABASE_SERVICE_ROLE_KEY` stays server-only and must never get a `NEXT_PUBLIC_` prefix.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "chore: scaffold Next.js project with shared types and Vitest"
```

---

## Task 2: Supabase schema migration (tables + RLS)

**Files:**
- Create: `supabase/migrations/0001_init.sql`

**Interfaces:**
- Produces: Postgres tables `profiles`, `goals`, `messages`, `email_log` matching the field names in `lib/types.ts` exactly (snake_case, no mapping layer).

- [ ] **Step 1: Initialize the Supabase project**

```bash
supabase init
```

(Requires the Supabase CLI installed — `brew install supabase/tap/supabase` if missing.)

- [ ] **Step 2: Write the schema migration**

Create `supabase/migrations/0001_init.sql`:

```sql
create extension if not exists pgcrypto;

create type focus_area as enum ('carrera', 'salud', 'relaciones', 'finanzas', 'personal');
create type tone as enum ('motivador', 'exigente', 'tierno', 'directo');
create type goal_status as enum ('active', 'achieved', 'paused');
create type send_status as enum ('pending', 'sent', 'failed');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  current_age int not null,
  future_self_age int not null,
  values text not null default '',
  focus_area focus_area not null,
  tone tone not null,
  delivery_hour_local int not null check (delivery_hour_local between 0 and 23),
  timezone text not null,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  status goal_status not null default 'active',
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  generated_at timestamptz not null default now(),
  sent_at timestamptz,
  send_status send_status not null default 'pending',
  model_used text not null
);

create table email_log (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  provider_id text,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);

create index goals_user_id_idx on goals(user_id);
create index messages_user_id_idx on messages(user_id);
create index messages_generated_at_idx on messages(generated_at desc);

alter table profiles enable row level security;
alter table goals enable row level security;
alter table messages enable row level security;
alter table email_log enable row level security;

create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);

create policy "goals_select_own" on goals for select using (auth.uid() = user_id);
create policy "goals_insert_own" on goals for insert with check (auth.uid() = user_id);
create policy "goals_update_own" on goals for update using (auth.uid() = user_id);

create policy "messages_select_own" on messages for select using (auth.uid() = user_id);
```

- [ ] **Step 3: Start the local Supabase stack**

Run: `supabase start`
Expected: prints local API URL, anon key, and service_role key — copy these into your local `.env.local` (based on `.env.example`) for later tasks.

- [ ] **Step 4: Apply the migration**

Run: `supabase db reset`
Expected: completes with no errors.

- [ ] **Step 5: Verify the tables**

Open Supabase Studio at `http://localhost:54323` → Table Editor. Confirm `profiles`, `goals`, `messages`, `email_log` all exist with the columns above.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations supabase/config.toml
git commit -m "feat: add database schema and RLS policies"
```

---

## Task 3: Supabase client utilities

**Files:**
- Create: `lib/supabase/browser.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/admin.ts`
- Test: `lib/supabase/admin.test.ts`

**Interfaces:**
- Consumes: none (env vars only)
- Produces: `createClient()` (sync, browser) from `lib/supabase/browser.ts`; `createClient()` (async, server components/route handlers) from `lib/supabase/server.ts`; `createAdminClient()` (sync, service-role) from `lib/supabase/admin.ts`. All later tasks that talk to Supabase import from these three files.

- [ ] **Step 1: Write the failing test for the admin client**

Create `lib/supabase/admin.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { createAdminClient } from './admin';

describe('createAdminClient', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    expect(() => createAdminClient()).toThrow(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    );
  });

  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => createAdminClient()).toThrow(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    );
  });

  it('returns a client with admin auth methods when both env vars are set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    const client = createAdminClient();
    expect(client.auth.admin).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/supabase/admin.test.ts`
Expected: FAIL — `./admin` module not found.

- [ ] **Step 3: Implement the admin client**

Create `lib/supabase/admin.ts`:

```ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/supabase/admin.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Implement the browser client**

Create `lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 6: Implement the server client**

Create `lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render — middleware refreshes the session instead.
          }
        },
      },
    }
  );
}
```

These two are thin framework wrappers with no meaningful unit-testable branch; they're exercised end-to-end when Task 4's login page and Task 13's dashboard page run.

- [ ] **Step 7: Commit**

```bash
git add lib/supabase
git commit -m "feat: add Supabase browser, server, and admin clients"
```

---

## Task 4: Route protection + login/signup pages

**Files:**
- Create: `lib/auth/routes.ts`
- Test: `lib/auth/routes.test.ts`
- Create: `middleware.ts`
- Create: `app/login/page.tsx`
- Create: `app/signup/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `lib/supabase/browser.ts` (Task 3)
- Produces: `isPublicRoute(pathname: string): boolean` from `lib/auth/routes.ts`, used by `middleware.ts`.

- [ ] **Step 1: Write the failing test for route classification**

Create `lib/auth/routes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isPublicRoute } from './routes';

describe('isPublicRoute', () => {
  it('treats the landing page as public', () => {
    expect(isPublicRoute('/')).toBe(true);
  });

  it('treats /login and /signup as public', () => {
    expect(isPublicRoute('/login')).toBe(true);
    expect(isPublicRoute('/signup')).toBe(true);
  });

  it('treats cron endpoints as public (protected by CRON_SECRET instead)', () => {
    expect(isPublicRoute('/api/cron/send-messages')).toBe(true);
  });

  it('treats dashboard, perfil, historial and onboarding as protected', () => {
    expect(isPublicRoute('/dashboard')).toBe(false);
    expect(isPublicRoute('/perfil')).toBe(false);
    expect(isPublicRoute('/historial')).toBe(false);
    expect(isPublicRoute('/onboarding')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth/routes.test.ts`
Expected: FAIL — `./routes` module not found.

- [ ] **Step 3: Implement isPublicRoute**

Create `lib/auth/routes.ts`:

```ts
const PUBLIC_ROUTES = new Set(['/', '/login', '/signup']);

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  if (pathname.startsWith('/api/cron')) return true;
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth/routes.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Implement the middleware**

Create `middleware.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isPublicRoute } from '@/lib/auth/routes';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !isPublicRoute(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 6: Build the login page**

Create `app/login/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main>
      <h1>Entrar</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          required
        />
        {error && <p role="alert">{error}</p>}
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Build the signup page**

Create `app/signup/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/onboarding');
    router.refresh();
  }

  return (
    <main>
      <h1>Crear cuenta</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          required
          minLength={6}
        />
        {error && <p role="alert">{error}</p>}
        <button type="submit">Crear cuenta</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 8: Replace the default landing page**

Overwrite `app/page.tsx` (currently the `create-next-app` boilerplate from Task 1):

```tsx
import Link from 'next/link';

export default function LandingPage() {
  return (
    <main>
      <h1>YO FUTURO</h1>
      <p>
        Cada día, tu yo futuro te escribe un mensaje — generado con IA a partir
        de tus metas, tus valores y quién quieres llegar a ser.
      </p>
      <nav>
        <Link href="/signup">Crear cuenta</Link>
        <Link href="/login">Entrar</Link>
      </nav>
    </main>
  );
}
```

- [ ] **Step 9: Manual verification**

Run `npm run dev`. Visit `/`, confirm the landing page renders with links to `/signup` and `/login`. Sign up a test user, confirm redirect to `/onboarding`. Log out (clear cookies), try to visit `/dashboard` directly, confirm redirect to `/login`. Log back in, confirm redirect to `/dashboard` works once that page exists (Task 13).

- [ ] **Step 10: Commit**

```bash
git add lib/auth middleware.ts app/login app/signup app/page.tsx
git commit -m "feat: add landing page, auth pages, and route protection middleware"
```

---

## Task 5: Onboarding flow

**Files:**
- Create: `lib/onboarding/validate.ts`
- Test: `lib/onboarding/validate.test.ts`
- Create: `app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `lib/supabase/browser.ts` (Task 3); `FocusArea`, `Tone` from `lib/types.ts` (Task 1)
- Produces: `validateProfileStep`, `validateGoals`, `validateDeliveryHour` from `lib/onboarding/validate.ts`

- [ ] **Step 1: Write the failing tests for validation helpers**

Create `lib/onboarding/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateProfileStep, validateGoals, validateDeliveryHour } from './validate';

describe('validateProfileStep', () => {
  const base = {
    name: 'Ana',
    currentAge: 25,
    futureSelfAge: 40,
    focusArea: 'carrera' as const,
    tone: 'motivador' as const,
    values: 'la honestidad',
  };

  it('accepts valid input', () => {
    expect(validateProfileStep(base)).toBeNull();
  });

  it('rejects an empty name', () => {
    expect(validateProfileStep({ ...base, name: '  ' })).toBe('El nombre es obligatorio');
  });

  it('rejects an out-of-range current age', () => {
    expect(validateProfileStep({ ...base, currentAge: 5 })).toBe(
      'La edad actual debe ser un número entre 13 y 120'
    );
  });

  it('rejects a future age that is not greater than the current age', () => {
    expect(validateProfileStep({ ...base, futureSelfAge: 25 })).toBe(
      'La edad futura debe ser mayor que tu edad actual'
    );
  });
});

describe('validateGoals', () => {
  it('rejects an empty goals list', () => {
    expect(validateGoals([])).toBe('Agrega al menos una meta');
  });

  it('rejects a list of only blank strings', () => {
    expect(validateGoals(['  ', ''])).toBe('Agrega al menos una meta');
  });

  it('accepts at least one non-empty goal', () => {
    expect(validateGoals(['Lanzar mi startup'])).toBeNull();
  });
});

describe('validateDeliveryHour', () => {
  it('accepts hours between 0 and 23', () => {
    expect(validateDeliveryHour(8)).toBeNull();
  });

  it('rejects negative hours', () => {
    expect(validateDeliveryHour(-1)).toBe('La hora debe estar entre 0 y 23');
  });

  it('rejects hours above 23', () => {
    expect(validateDeliveryHour(24)).toBe('La hora debe estar entre 0 y 23');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/onboarding/validate.test.ts`
Expected: FAIL — `./validate` module not found.

- [ ] **Step 3: Implement the validation helpers**

Create `lib/onboarding/validate.ts`:

```ts
import type { FocusArea, Tone } from '@/lib/types';

export interface ProfileStepInput {
  name: string;
  currentAge: number;
  futureSelfAge: number;
  focusArea: FocusArea;
  tone: Tone;
  values: string;
}

export function validateProfileStep(input: ProfileStepInput): string | null {
  if (!input.name.trim()) return 'El nombre es obligatorio';
  if (!Number.isInteger(input.currentAge) || input.currentAge < 13 || input.currentAge > 120) {
    return 'La edad actual debe ser un número entre 13 y 120';
  }
  if (!Number.isInteger(input.futureSelfAge) || input.futureSelfAge <= input.currentAge) {
    return 'La edad futura debe ser mayor que tu edad actual';
  }
  return null;
}

export function validateGoals(goals: string[]): string | null {
  const nonEmpty = goals.map((g) => g.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return 'Agrega al menos una meta';
  return null;
}

export function validateDeliveryHour(hour: number): string | null {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return 'La hora debe estar entre 0 y 23';
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/onboarding/validate.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Build the onboarding page**

Create `app/onboarding/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { validateProfileStep, validateGoals, validateDeliveryHour } from '@/lib/onboarding/validate';
import type { FocusArea, Tone } from '@/lib/types';

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [currentAge, setCurrentAge] = useState(25);
  const [futureSelfAge, setFutureSelfAge] = useState(40);
  const [focusArea, setFocusArea] = useState<FocusArea>('personal');
  const [tone, setTone] = useState<Tone>('motivador');
  const [values, setValues] = useState('');
  const [goals, setGoals] = useState<string[]>(['']);
  const [deliveryHour, setDeliveryHour] = useState(8);
  const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const router = useRouter();

  function nextFromStep1() {
    const err = validateProfileStep({ name, currentAge, futureSelfAge, focusArea, tone, values });
    if (err) return setError(err);
    setError(null);
    setStep(2);
  }

  function nextFromStep2() {
    const err = validateGoals(goals);
    if (err) return setError(err);
    setError(null);
    setStep(3);
  }

  async function finishOnboarding() {
    const err = validateDeliveryHour(deliveryHour);
    if (err) return setError(err);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Sesión expirada, vuelve a iniciar sesión.');
      return;
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: user.id,
      name,
      current_age: currentAge,
      future_self_age: futureSelfAge,
      focus_area: focusArea,
      tone,
      values,
      delivery_hour_local: deliveryHour,
      timezone,
      onboarding_completed: true,
    });
    if (profileError) return setError(profileError.message);

    const nonEmptyGoals = goals.map((g) => g.trim()).filter(Boolean);
    const { error: goalsError } = await supabase
      .from('goals')
      .insert(nonEmptyGoals.map((description) => ({ user_id: user.id, description })));
    if (goalsError) return setError(goalsError.message);

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main>
      <h1>Cuéntale a tu yo futuro sobre ti</h1>
      {error && <p role="alert">{error}</p>}

      {step === 1 && (
        <section>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
          <input
            type="number"
            value={currentAge}
            onChange={(e) => setCurrentAge(Number(e.target.value))}
            placeholder="Edad actual"
          />
          <input
            type="number"
            value={futureSelfAge}
            onChange={(e) => setFutureSelfAge(Number(e.target.value))}
            placeholder="Edad de tu yo futuro"
          />
          <select value={focusArea} onChange={(e) => setFocusArea(e.target.value as FocusArea)}>
            <option value="carrera">Carrera</option>
            <option value="salud">Salud</option>
            <option value="relaciones">Relaciones</option>
            <option value="finanzas">Finanzas</option>
            <option value="personal">Personal</option>
          </select>
          <select value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
            <option value="motivador">Motivador</option>
            <option value="exigente">Exigente</option>
            <option value="tierno">Tierno</option>
            <option value="directo">Directo</option>
          </select>
          <textarea
            value={values}
            onChange={(e) => setValues(e.target.value)}
            placeholder="¿Qué valoras más?"
          />
          <button type="button" onClick={nextFromStep1}>Siguiente</button>
        </section>
      )}

      {step === 2 && (
        <section>
          <h2>Tus metas</h2>
          {goals.map((goal, i) => (
            <input
              key={i}
              value={goal}
              onChange={(e) => {
                const next = [...goals];
                next[i] = e.target.value;
                setGoals(next);
              }}
              placeholder={`Meta ${i + 1}`}
            />
          ))}
          <button type="button" onClick={() => setGoals([...goals, ''])}>Agregar otra meta</button>
          <button type="button" onClick={nextFromStep2}>Siguiente</button>
        </section>
      )}

      {step === 3 && (
        <section>
          <h2>¿Cuándo quieres recibir tu mensaje?</h2>
          <input
            type="number"
            min={0}
            max={23}
            value={deliveryHour}
            onChange={(e) => setDeliveryHour(Number(e.target.value))}
          />
          <p>Zona horaria detectada: {timezone}</p>
          <button type="button" onClick={finishOnboarding}>Terminar</button>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Manual verification**

Sign up a new test user, complete all 3 onboarding steps, confirm redirect to `/dashboard` and that `profiles`/`goals` rows appear correctly in Supabase Studio.

- [ ] **Step 7: Commit**

```bash
git add lib/onboarding app/onboarding
git commit -m "feat: add onboarding flow with validation"
```

---

## Task 6: Perfil page — edit profile, goals CRUD, logout

**Files:**
- Create: `app/perfil/page.tsx`
- Create: `app/perfil/PerfilForm.tsx`

**Interfaces:**
- Consumes: `createClient()` from `lib/supabase/server.ts` (Task 3, in `page.tsx`) and from `lib/supabase/browser.ts` (Task 3, in `PerfilForm.tsx`); `Profile`, `Goal` from `lib/types.ts`
- Produces: `<PerfilForm profile={Profile} goals={Goal[]} />` component, extended in Task 7 with account deletion.

- [ ] **Step 1: Build the server page that loads current data**

Create `app/perfil/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PerfilForm } from './PerfilForm';

export default async function PerfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const { data: goals } = await supabase.from('goals').select('*').eq('user_id', user.id);

  if (!profile) redirect('/onboarding');

  return <PerfilForm profile={profile} goals={goals ?? []} />;
}
```

- [ ] **Step 2: Build the interactive client form**

Create `app/perfil/PerfilForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import type { Profile, Goal, GoalStatus } from '@/lib/types';

export function PerfilForm({ profile, goals }: { profile: Profile; goals: Goal[] }) {
  const [name, setName] = useState(profile.name);
  const [values, setValues] = useState(profile.values);
  const [deliveryHour, setDeliveryHour] = useState(profile.delivery_hour_local);
  const [goalList, setGoalList] = useState(goals);
  const [newGoal, setNewGoal] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function saveProfile() {
    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ name, values, delivery_hour_local: deliveryHour })
      .eq('id', profile.id);
    setMessage(error ? error.message : 'Perfil actualizado');
  }

  async function addGoal() {
    if (!newGoal.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from('goals')
      .insert({ user_id: profile.id, description: newGoal.trim() })
      .select()
      .single();
    if (!error && data) {
      setGoalList([...goalList, data]);
      setNewGoal('');
    }
  }

  async function setGoalStatus(goalId: string, status: GoalStatus) {
    const supabase = createClient();
    const { error } = await supabase.from('goals').update({ status }).eq('id', goalId);
    if (!error) {
      setGoalList(goalList.map((g) => (g.id === goalId ? { ...g, status } : g)));
    }
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <main>
      <h1>Tu perfil</h1>
      {message && <p role="status">{message}</p>}

      <section>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
        <textarea value={values} onChange={(e) => setValues(e.target.value)} placeholder="Lo que valoras" />
        <input
          type="number"
          min={0}
          max={23}
          value={deliveryHour}
          onChange={(e) => setDeliveryHour(Number(e.target.value))}
        />
        <button type="button" onClick={saveProfile}>Guardar cambios</button>
      </section>

      <section>
        <h2>Tus metas</h2>
        <ul>
          {goalList.map((goal) => (
            <li key={goal.id}>
              {goal.description} — {goal.status}
              {goal.status === 'active' && (
                <button type="button" onClick={() => setGoalStatus(goal.id, 'achieved')}>
                  Marcar como lograda
                </button>
              )}
            </li>
          ))}
        </ul>
        <input value={newGoal} onChange={(e) => setNewGoal(e.target.value)} placeholder="Nueva meta" />
        <button type="button" onClick={addGoal}>Agregar meta</button>
      </section>

      <button type="button" onClick={logout}>Cerrar sesión</button>
    </main>
  );
}
```

- [ ] **Step 3: Manual verification**

Log in as a test user, visit `/perfil`, edit the name/hour and save, confirm the change persists in Supabase Studio. Add a goal, mark it as achieved, confirm the status updates. Click "Cerrar sesión" and confirm redirect to `/login` with the session cleared.

- [ ] **Step 4: Commit**

```bash
git add app/perfil
git commit -m "feat: add profile page with goal management and logout"
```

---

## Task 7: Account deletion

**Files:**
- Create: `app/api/account/delete/route.ts`
- Modify: `app/perfil/PerfilForm.tsx`

**Interfaces:**
- Consumes: `createAdminClient()` from `lib/supabase/admin.ts`, `createClient()` from `lib/supabase/server.ts` (both Task 3)
- Produces: `POST /api/account/delete` endpoint

- [ ] **Step 1: Implement the delete endpoint**

Create `app/api/account/delete/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Wire the confirmation UI into the profile form**

Modify `app/perfil/PerfilForm.tsx` — add state and a confirmation modal for account deletion. Add near the top of the component, alongside the other `useState` calls:

```tsx
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
```

Add this function alongside `logout`:

```tsx
  async function deleteAccount() {
    const res = await fetch('/api/account/delete', { method: 'POST' });
    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      const body = await res.json();
      setMessage(body.error ?? 'No se pudo eliminar la cuenta');
    }
  }
```

Replace the final `<button type="button" onClick={logout}>Cerrar sesión</button>` line with:

```tsx
      <button type="button" onClick={logout}>Cerrar sesión</button>

      <button type="button" onClick={() => setShowDeleteConfirm(true)}>Eliminar cuenta</button>
      {showDeleteConfirm && (
        <div role="dialog">
          <p>Escribe ELIMINAR para confirmar que quieres borrar tu cuenta permanentemente.</p>
          <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} />
          <button
            type="button"
            disabled={deleteConfirmText !== 'ELIMINAR'}
            onClick={deleteAccount}
          >
            Confirmar eliminación
          </button>
          <button type="button" onClick={() => setShowDeleteConfirm(false)}>Cancelar</button>
        </div>
      )}
```

- [ ] **Step 3: Manual verification**

Log in as a disposable test user, go to `/perfil`, click "Eliminar cuenta", type `ELIMINAR`, confirm. Verify redirect to `/`, and verify in Supabase Studio that the user under Authentication is gone and their `profiles`/`goals`/`messages` rows were cascade-deleted.

- [ ] **Step 4: Commit**

```bash
git add app/api/account app/perfil/PerfilForm.tsx
git commit -m "feat: add account deletion with confirmation"
```

---

## Task 8: Delivery-hour matching logic

**Files:**
- Create: `lib/messages/delivery.ts`
- Test: `lib/messages/delivery.test.ts`

**Interfaces:**
- Produces: `isDueNow(deliveryHourLocal: number, timezone: string, nowUtc: Date): boolean`, used by Task 12's cron route.

- [ ] **Step 1: Write the failing tests**

Create `lib/messages/delivery.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isDueNow } from './delivery';

describe('isDueNow', () => {
  it('returns true when the local hour matches the delivery hour', () => {
    // 2026-01-15T14:00:00Z is 08:00 in America/Mexico_City (UTC-6)
    const now = new Date('2026-01-15T14:00:00Z');
    expect(isDueNow(8, 'America/Mexico_City', now)).toBe(true);
  });

  it('returns false when the local hour does not match', () => {
    const now = new Date('2026-01-15T14:00:00Z');
    expect(isDueNow(9, 'America/Mexico_City', now)).toBe(false);
  });

  it('handles midnight correctly (0, not 24)', () => {
    // 2026-01-15T06:00:00Z is 00:00 in America/Mexico_City (UTC-6)
    const now = new Date('2026-01-15T06:00:00Z');
    expect(isDueNow(0, 'America/Mexico_City', now)).toBe(true);
  });

  it('works across a different timezone (UTC+9)', () => {
    // 2026-01-15T23:00:00Z is 08:00 the next day in Asia/Tokyo (UTC+9)
    const now = new Date('2026-01-15T23:00:00Z');
    expect(isDueNow(8, 'Asia/Tokyo', now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/messages/delivery.test.ts`
Expected: FAIL — `./delivery` module not found.

- [ ] **Step 3: Implement isDueNow**

Create `lib/messages/delivery.ts`:

```ts
export function isDueNow(deliveryHourLocal: number, timezone: string, nowUtc: Date): boolean {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).format(nowUtc);
  const localHour = Number(formatted) % 24;
  return localHour === deliveryHourLocal;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/messages/delivery.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/messages/delivery.ts lib/messages/delivery.test.ts
git commit -m "feat: add timezone-aware delivery hour matching"
```

---

## Task 9: Prompt builder

**Files:**
- Create: `lib/messages/prompt.ts`
- Test: `lib/messages/prompt.test.ts`

**Interfaces:**
- Consumes: `Profile`, `Goal`, `MessageRecord` from `lib/types.ts` (Task 1)
- Produces: `buildPrompt(profile: Profile, activeGoals: Goal[], recentMessages: MessageRecord[]): string`, used by Task 10's `generateMessage`.

- [ ] **Step 1: Write the failing tests**

Create `lib/messages/prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPrompt } from './prompt';
import type { Profile, Goal, MessageRecord } from '@/lib/types';

const profile: Profile = {
  id: 'u1',
  name: 'Ana',
  current_age: 25,
  future_self_age: 40,
  values: 'la honestidad',
  focus_area: 'carrera',
  tone: 'motivador',
  delivery_hour_local: 8,
  timezone: 'America/Mexico_City',
  onboarding_completed: true,
  created_at: '',
  updated_at: '',
};

describe('buildPrompt', () => {
  it('includes the profile details', () => {
    const prompt = buildPrompt(profile, [], []);
    expect(prompt).toContain('Ana');
    expect(prompt).toContain('40 años');
    expect(prompt).toContain('motivador');
    expect(prompt).toContain('la honestidad');
    expect(prompt).toContain('carrera');
  });

  it('lists active goals', () => {
    const goals: Goal[] = [
      { id: 'g1', user_id: 'u1', description: 'Lanzar mi startup', status: 'active', created_at: '' },
    ];
    const prompt = buildPrompt(profile, goals, []);
    expect(prompt).toContain('Lanzar mi startup');
  });

  it('notes when there are no active goals', () => {
    const prompt = buildPrompt(profile, [], []);
    expect(prompt).toContain('sin metas activas registradas');
  });

  it('includes recent messages so Claude avoids repeating them', () => {
    const recent: MessageRecord[] = [
      {
        id: 'm1',
        user_id: 'u1',
        content: 'Sigue así.',
        generated_at: '',
        sent_at: null,
        send_status: 'sent',
        model_used: 'claude-sonnet-5',
      },
    ];
    const prompt = buildPrompt(profile, [], recent);
    expect(prompt).toContain('Sigue así.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/messages/prompt.test.ts`
Expected: FAIL — `./prompt` module not found.

- [ ] **Step 3: Implement buildPrompt**

Create `lib/messages/prompt.ts`:

```ts
import type { Profile, Goal, MessageRecord } from '@/lib/types';

export function buildPrompt(
  profile: Profile,
  activeGoals: Goal[],
  recentMessages: MessageRecord[]
): string {
  const goalsList =
    activeGoals.length > 0
      ? activeGoals.map((g) => `- ${g.description}`).join('\n')
      : '- (sin metas activas registradas)';

  const recentList =
    recentMessages.length > 0
      ? recentMessages.map((m) => `- ${m.content}`).join('\n')
      : '- (ningún mensaje previo)';

  return `Eres el "yo futuro" de ${profile.name}, hablándole desde cuando tenga ${profile.future_self_age} años (hoy tiene ${profile.current_age}).
Tu tono debe ser: ${profile.tone}.
Lo que ${profile.name} más valora: ${profile.values}.
Área de vida en la que se está enfocando: ${profile.focus_area}.

Sus metas activas son:
${goalsList}

Estos son sus últimos mensajes recibidos (no los repitas ni en contenido ni en frases):
${recentList}

Escribe un mensaje breve (máximo 120 palabras), en español, en primera persona, como si tu yo futuro le escribiera hoy a ${profile.name}. No uses saludos genéricos tipo "Hola querido yo". Ve directo al mensaje.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/messages/prompt.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/messages/prompt.ts lib/messages/prompt.test.ts
git commit -m "feat: add message prompt builder"
```

---

## Task 10: Claude message generation wrapper

**Files:**
- Create: `lib/messages/generate.ts`
- Test: `lib/messages/generate.test.ts`

**Interfaces:**
- Consumes: `buildPrompt` from `lib/messages/prompt.ts` (Task 9); `Profile`, `Goal`, `MessageRecord` from `lib/types.ts` (Task 1)
- Produces: `generateMessage(profile, activeGoals, recentMessages, client?): Promise<{content: string; modelUsed: string}>`, used by Task 12's cron route.

- [ ] **Step 1: Write the failing tests**

Create `lib/messages/generate.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { generateMessage } from './generate';
import type { Profile, Goal, MessageRecord } from '@/lib/types';

const profile: Profile = {
  id: 'u1',
  name: 'Ana',
  current_age: 25,
  future_self_age: 40,
  values: 'la honestidad',
  focus_area: 'carrera',
  tone: 'motivador',
  delivery_hour_local: 8,
  timezone: 'America/Mexico_City',
  onboarding_completed: true,
  created_at: '',
  updated_at: '',
};
const goals: Goal[] = [
  { id: 'g1', user_id: 'u1', description: 'Lanzar mi startup', status: 'active', created_at: '' },
];
const recent: MessageRecord[] = [];

describe('generateMessage', () => {
  it('returns the text content and model used', async () => {
    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Sigue adelante, Ana.' }],
        }),
      },
    } as any;

    const result = await generateMessage(profile, goals, recent, fakeClient);

    expect(result).toEqual({ content: 'Sigue adelante, Ana.', modelUsed: 'claude-sonnet-5' });
    expect(fakeClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-5' })
    );
  });

  it('throws if Claude returns no text block', async () => {
    const fakeClient = {
      messages: { create: vi.fn().mockResolvedValue({ content: [] }) },
    } as any;

    await expect(generateMessage(profile, goals, recent, fakeClient)).rejects.toThrow(
      'Claude no devolvió contenido de texto'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/messages/generate.test.ts`
Expected: FAIL — `./generate` module not found.

- [ ] **Step 3: Implement generateMessage**

Create `lib/messages/generate.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt } from './prompt';
import type { Profile, Goal, MessageRecord } from '@/lib/types';

const MODEL = 'claude-sonnet-5';

export interface GeneratedMessage {
  content: string;
  modelUsed: string;
}

export async function generateMessage(
  profile: Profile,
  activeGoals: Goal[],
  recentMessages: MessageRecord[],
  client: Anthropic = new Anthropic()
): Promise<GeneratedMessage> {
  const prompt = buildPrompt(profile, activeGoals, recentMessages);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude no devolvió contenido de texto');
  }

  return { content: textBlock.text, modelUsed: MODEL };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/messages/generate.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/messages/generate.ts lib/messages/generate.test.ts
git commit -m "feat: add Claude-backed message generation"
```

---

## Task 11: Resend email wrapper

**Files:**
- Create: `lib/email/send.ts`
- Test: `lib/email/send.test.ts`

**Interfaces:**
- Produces: `sendDailyEmail(toEmail: string, messageContent: string, client?): Promise<{providerId: string | null; status: 'sent' | 'failed'; error: string | null}>`, used by Task 12's cron route.

- [ ] **Step 1: Write the failing tests**

Create `lib/email/send.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { sendDailyEmail } from './send';

describe('sendDailyEmail', () => {
  it('returns sent status and provider id on success', async () => {
    const fakeClient = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null }),
      },
    } as any;

    const result = await sendDailyEmail('ana@example.com', 'Sigue adelante.', fakeClient);

    expect(result).toEqual({ providerId: 'email-123', status: 'sent', error: null });
  });

  it('returns failed status and error message on failure', async () => {
    const fakeClient = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: null, error: { message: 'invalid domain' } }),
      },
    } as any;

    const result = await sendDailyEmail('ana@example.com', 'Sigue adelante.', fakeClient);

    expect(result).toEqual({ providerId: null, status: 'failed', error: 'invalid domain' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/email/send.test.ts`
Expected: FAIL — `./send` module not found.

- [ ] **Step 3: Implement sendDailyEmail**

Create `lib/email/send.ts`:

```ts
import { Resend } from 'resend';

export interface SendEmailResult {
  providerId: string | null;
  status: 'sent' | 'failed';
  error: string | null;
}

export async function sendDailyEmail(
  toEmail: string,
  messageContent: string,
  client: Resend = new Resend(process.env.RESEND_API_KEY)
): Promise<SendEmailResult> {
  const { data, error } = await client.emails.send({
    from: 'Yo Futuro <hola@yofuturo.app>',
    to: toEmail,
    subject: 'Tu mensaje de hoy de tu yo futuro',
    text: messageContent,
  });

  if (error) {
    return { providerId: null, status: 'failed', error: error.message };
  }

  return { providerId: data?.id ?? null, status: 'sent', error: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/email/send.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/email/send.ts lib/email/send.test.ts
git commit -m "feat: add Resend email wrapper"
```

---

## Task 12: Cron route + Vercel schedule

**Files:**
- Create: `app/api/cron/send-messages/route.ts`
- Test: `app/api/cron/send-messages/route.test.ts`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `createAdminClient()` (Task 3), `isDueNow()` (Task 8), `generateMessage()` (Task 10), `sendDailyEmail()` (Task 11), `Profile`/`Goal`/`MessageRecord` (Task 1)
- Produces: `GET /api/cron/send-messages` endpoint

- [ ] **Step 1: Write the failing test for the auth check**

Create `app/api/cron/send-messages/route.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('GET /api/cron/send-messages', () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it('rejects requests without the correct CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'right-secret';
    const request = new NextRequest('http://localhost/api/cron/send-messages', {
      headers: { authorization: 'Bearer wrong-secret' },
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/cron/send-messages/route.test.ts`
Expected: FAIL — `./route` module not found.

- [ ] **Step 3: Implement the cron route**

Create `app/api/cron/send-messages/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isDueNow } from '@/lib/messages/delivery';
import { generateMessage } from '@/lib/messages/generate';
import { sendDailyEmail } from '@/lib/email/send';
import type { Profile, Goal, MessageRecord } from '@/lib/types';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('onboarding_completed', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dueProfiles = (profiles as Profile[]).filter((p) =>
    isDueNow(p.delivery_hour_local, p.timezone, now)
  );

  const results = await Promise.allSettled(
    dueProfiles.map((profile) => processUser(supabase, profile))
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - succeeded;

  return NextResponse.json({ processed: results.length, succeeded, failed });
}

async function processUser(supabase: ReturnType<typeof createAdminClient>, profile: Profile) {
  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', profile.id)
    .eq('status', 'active');

  const { data: recentMessages } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', profile.id)
    .order('generated_at', { ascending: false })
    .limit(2);

  const { content, modelUsed } = await generateMessage(
    profile,
    (goals as Goal[]) ?? [],
    (recentMessages as MessageRecord[]) ?? []
  );

  const { data: inserted, error: insertError } = await supabase
    .from('messages')
    .insert({ user_id: profile.id, content, model_used: modelUsed, send_status: 'pending' })
    .select()
    .single();

  if (insertError || !inserted) {
    throw new Error(`No se pudo guardar el mensaje: ${insertError?.message}`);
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(profile.id);
  const email = authUser?.user?.email;
  if (!email) {
    throw new Error('Usuario sin email registrado');
  }

  const emailResult = await sendDailyEmail(email, content);

  await supabase
    .from('messages')
    .update({
      send_status: emailResult.status,
      sent_at: emailResult.status === 'sent' ? new Date().toISOString() : null,
    })
    .eq('id', inserted.id);

  await supabase.from('email_log').insert({
    message_id: inserted.id,
    provider_id: emailResult.providerId,
    status: emailResult.status,
    error: emailResult.error,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/cron/send-messages/route.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Configure the Vercel Cron schedule**

Create `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/send-messages", "schedule": "0 * * * *" }
  ]
}
```

Note: when `CRON_SECRET` is set as an environment variable in the Vercel project, Vercel automatically sends it as `Authorization: Bearer <CRON_SECRET>` on cron invocations — no extra configuration needed.

- [ ] **Step 6: Manual end-to-end verification**

Create a test user via signup + onboarding with `delivery_hour_local` set to the current local hour. In `.env.local`, set a `CRON_SECRET` value. Run:

```bash
curl -H "Authorization: Bearer <your CRON_SECRET>" http://localhost:3000/api/cron/send-messages
```

Confirm the response reports `succeeded: 1`, a row appears in `messages` with `send_status: sent`, a row appears in `email_log`, and the test email arrives (check the Resend dashboard/logs if using a sandbox domain).

- [ ] **Step 7: Commit**

```bash
git add app/api/cron vercel.json
git commit -m "feat: add hourly cron route to generate and send daily messages"
```

---

## Task 13: Dashboard page

**Files:**
- Create: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `lib/supabase/server.ts` (Task 3)

- [ ] **Step 1: Build the dashboard page**

Create `app/dashboard/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: latestMessage } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', user.id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main>
      <h1>Tu mensaje de hoy</h1>
      {latestMessage ? (
        <p>{latestMessage.content}</p>
      ) : (
        <p>Tu yo futuro todavía no te ha escrito.</p>
      )}
      <nav>
        <a href="/historial">Ver historial</a>
        <a href="/perfil">Editar perfil</a>
      </nav>
    </main>
  );
}
```

- [ ] **Step 2: Manual verification**

Log in as the test user from Task 12 (who now has a generated message). Visit `/dashboard`, confirm the message content renders. Log in as a brand-new onboarded user with no messages yet, confirm the empty-state text renders instead.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard
git commit -m "feat: add dashboard page showing latest message"
```

---

## Task 14: Historial page with empty state

**Files:**
- Create: `lib/historial/emptyStateCopy.ts`
- Test: `lib/historial/emptyStateCopy.test.ts`
- Create: `app/historial/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `lib/supabase/server.ts` (Task 3)
- Produces: `emptyStateCopy(deliveryHourLocal: number, timezone: string): string`

- [ ] **Step 1: Write the failing test**

Create `lib/historial/emptyStateCopy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { emptyStateCopy } from './emptyStateCopy';

describe('emptyStateCopy', () => {
  it('includes the delivery hour and timezone', () => {
    expect(emptyStateCopy(8, 'America/Mexico_City')).toBe(
      'Tu yo futuro todavía no te ha escrito — tu primer mensaje llegará a las 8:00 de America/Mexico_City.'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/historial/emptyStateCopy.test.ts`
Expected: FAIL — `./emptyStateCopy` module not found.

- [ ] **Step 3: Implement emptyStateCopy**

Create `lib/historial/emptyStateCopy.ts`:

```ts
export function emptyStateCopy(deliveryHourLocal: number, timezone: string): string {
  return `Tu yo futuro todavía no te ha escrito — tu primer mensaje llegará a las ${deliveryHourLocal}:00 de ${timezone}.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/historial/emptyStateCopy.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Build the historial page**

Create `app/historial/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { emptyStateCopy } from '@/lib/historial/emptyStateCopy';

export default async function HistorialPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', user.id)
    .order('generated_at', { ascending: false });

  if (!messages || messages.length === 0) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('delivery_hour_local, timezone')
      .eq('id', user.id)
      .single();

    return (
      <main>
        <h1>Historial</h1>
        <p>
          {profile
            ? emptyStateCopy(profile.delivery_hour_local, profile.timezone)
            : 'Tu yo futuro todavía no te ha escrito.'}
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Historial</h1>
      <ul>
        {messages.map((m) => (
          <li key={m.id}>
            <time>{new Date(m.generated_at).toLocaleDateString('es-MX')}</time>
            <p>{m.content}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 6: Manual verification**

Visit `/historial` as the brand-new user (no messages) and confirm the empty-state copy renders with their actual delivery hour/timezone. Visit as the test user with a generated message and confirm it appears in the list.

- [ ] **Step 7: Commit**

```bash
git add lib/historial app/historial
git commit -m "feat: add historial page with empty state"
```

---

## Final check

Run the full test suite and type check before considering the MVP done:

```bash
npx vitest run
npx tsc --noEmit
```

Expected: all tests pass, no type errors.

**Deployment (manual, not code):** connect the repo to a Vercel project, set all six variables from `.env.example` in the Vercel dashboard (Production + Preview), link the Vercel project to a real Supabase project (not local), run `supabase db push` to apply migrations there, and configure Resend with a verified sending domain before relying on real email delivery.
