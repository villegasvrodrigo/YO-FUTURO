# Onboarding Conversacional (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static 3-step onboarding form with a guided natural-language conversation that extracts the same structured `profiles`/`goals` data via Claude structured outputs, ending in an editable confirmation screen before saving.

**Architecture:** The user chats freely; on every turn the client sends the full transcript to a server route, which asks Claude (via `client.messages.parse()` + a Zod schema) for the assistant's next reply, the best-guess extracted fields so far, and a `done` flag. The client merges partial extractions turn over turn until `done`, then shows an editable confirmation form (reusing the existing validation functions and the exact same `profiles`/`goals` insert already in production) before saving. No database schema changes.

**Tech Stack:** Next.js (App Router, TypeScript), `@anthropic-ai/sdk` (`client.messages.parse` + `zodOutputFormat`), Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-yo-futuro-expansion-roadmap.md` (Fase 1 section)

## Global Constraints

- AI model: `claude-sonnet-5`, via the official `@anthropic-ai/sdk` — same constraint as the rest of the app.
- All UI copy and the conversation itself are in Spanish.
- No new database tables or columns — the conversation is not persisted server-side; only the final confirmed values are written, via the same `profiles`/`goals` insert shape already in production.
- The onboarding script (what topics to ask about, in what order) lives in exactly one file, `lib/onboarding/script.ts`, so it can be replaced later without touching any other file.
- All new pages/components follow the existing "Papel y Brasa" dark theme: `bg-ink`/`bg-dusk-2` surfaces, `text-parchment` body text, `text-brass` accents, `font-mono` for labels/metadata, `border-rule`/`border-danger` for borders, the shared `fieldClass`/`labelClass` pattern already used in `app/login/page.tsx`, `app/signup/page.tsx`, and `app/perfil/PerfilForm.tsx`.

---

## Task 1: Onboarding script config + Zod dependency

**Files:**
- Modify: `package.json` (add `zod` dependency)
- Create: `lib/onboarding/script.ts`

**Interfaces:**
- Produces: `OnboardingScriptStep` type, `ONBOARDING_SCRIPT: OnboardingScriptStep[]`, `ONBOARDING_GREETING: string` — all consumed by Task 3 (`chat.ts`) and Task 5 (`page.tsx`).

- [ ] **Step 1: Install Zod**

```bash
npm install zod
```

- [ ] **Step 2: Create the script config**

Create `lib/onboarding/script.ts`:

```ts
export interface OnboardingScriptStep {
  field:
    | 'name'
    | 'currentAge'
    | 'futureSelfAge'
    | 'focusArea'
    | 'tone'
    | 'values'
    | 'goals'
    | 'deliveryHour';
  instruction: string;
}

export const ONBOARDING_GREETING =
  'Hola. Voy a ayudarte a preparar tu primer mensaje de tu yo futuro. Para empezar, cuéntame un poco de ti: ¿cómo te llamas y qué te gustaría lograr?';

export const ONBOARDING_SCRIPT: OnboardingScriptStep[] = [
  { field: 'name', instruction: 'Descubre cómo se llama la persona.' },
  { field: 'currentAge', instruction: 'Descubre su edad actual.' },
  {
    field: 'futureSelfAge',
    instruction: 'Descubre a qué edad quiere que le hable su yo futuro.',
  },
  {
    field: 'focusArea',
    instruction:
      'Descubre en qué área de su vida quiere enfocarse: carrera, salud, relaciones, finanzas o personal.',
  },
  {
    field: 'tone',
    instruction:
      'Descubre qué tono prefiere para los mensajes: motivador, exigente, tierno o directo.',
  },
  { field: 'values', instruction: 'Descubre qué es lo que más valora en la vida.' },
  {
    field: 'goals',
    instruction: 'Descubre una o más metas concretas que quiere lograr.',
  },
  {
    field: 'deliveryHour',
    instruction:
      'Descubre a qué hora del día (0-23) le gustaría recibir su mensaje diario.',
  },
];
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/onboarding/script.ts
git commit -m "feat: add onboarding conversation script config"
```

---

## Task 2: Extraction schema + merge logic

**Files:**
- Create: `lib/onboarding/extraction.ts`
- Test: `lib/onboarding/extraction.test.ts`

**Interfaces:**
- Produces: `ExtractedProfileSchema`, `ExtractedProfile` type, `OnboardingTurnSchema`, `OnboardingTurnResult` type, `ChatMessage` type, `EMPTY_EXTRACTED_PROFILE`, `mergeExtracted(prev, next): ExtractedProfile` — all consumed by Task 3 (`chat.ts`) and Task 5 (`page.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `lib/onboarding/extraction.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeExtracted, EMPTY_EXTRACTED_PROFILE, type ExtractedProfile } from './extraction';

describe('mergeExtracted', () => {
  it('fills in previously-unknown fields from the new extraction', () => {
    const prev = EMPTY_EXTRACTED_PROFILE;
    const next: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, name: 'Ana', currentAge: 25 };
    const merged = mergeExtracted(prev, next);
    expect(merged.name).toBe('Ana');
    expect(merged.currentAge).toBe(25);
  });

  it('keeps previously-known fields when the new extraction has null for them', () => {
    const prev: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, name: 'Ana' };
    const next: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, name: null, currentAge: 25 };
    const merged = mergeExtracted(prev, next);
    expect(merged.name).toBe('Ana');
    expect(merged.currentAge).toBe(25);
  });

  it('overwrites a previously-known field when the new extraction has a different non-null value', () => {
    const prev: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, deliveryHour: 8 };
    const next: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, deliveryHour: 20 };
    const merged = mergeExtracted(prev, next);
    expect(merged.deliveryHour).toBe(20);
  });

  it('merges the goals array as a whole when present in the new extraction', () => {
    const prev: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, goals: ['Meta 1'] };
    const next: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, goals: ['Meta 1', 'Meta 2'] };
    const merged = mergeExtracted(prev, next);
    expect(merged.goals).toEqual(['Meta 1', 'Meta 2']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/onboarding/extraction.test.ts`
Expected: FAIL — `./extraction` module not found.

- [ ] **Step 3: Implement the schema and merge logic**

Create `lib/onboarding/extraction.ts`:

```ts
import { z } from 'zod';

export const ExtractedProfileSchema = z.object({
  name: z.string().nullable(),
  currentAge: z.number().int().nullable(),
  futureSelfAge: z.number().int().nullable(),
  focusArea: z.enum(['carrera', 'salud', 'relaciones', 'finanzas', 'personal']).nullable(),
  tone: z.enum(['motivador', 'exigente', 'tierno', 'directo']).nullable(),
  values: z.string().nullable(),
  goals: z.array(z.string()).nullable(),
  deliveryHour: z.number().int().nullable(),
});

export type ExtractedProfile = z.infer<typeof ExtractedProfileSchema>;

export const OnboardingTurnSchema = z.object({
  assistantReply: z.string(),
  extracted: ExtractedProfileSchema,
  done: z.boolean(),
});

export type OnboardingTurnResult = z.infer<typeof OnboardingTurnSchema>;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const EMPTY_EXTRACTED_PROFILE: ExtractedProfile = {
  name: null,
  currentAge: null,
  futureSelfAge: null,
  focusArea: null,
  tone: null,
  values: null,
  goals: null,
  deliveryHour: null,
};

export function mergeExtracted(
  prev: ExtractedProfile,
  next: ExtractedProfile
): ExtractedProfile {
  const merged = { ...prev };
  (Object.keys(next) as (keyof ExtractedProfile)[]).forEach((key) => {
    if (next[key] !== null) {
      (merged as Record<keyof ExtractedProfile, unknown>)[key] = next[key];
    }
  });
  return merged;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/onboarding/extraction.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding/extraction.ts lib/onboarding/extraction.test.ts
git commit -m "feat: add onboarding extraction schema and merge logic"
```

---

## Task 3: Claude-backed conversation turn (runOnboardingTurn)

**Files:**
- Create: `lib/onboarding/chat.ts`
- Test: `lib/onboarding/chat.test.ts`

**Interfaces:**
- Consumes: `OnboardingTurnSchema`, `OnboardingTurnResult`, `ChatMessage` from `lib/onboarding/extraction.ts` (Task 2); `OnboardingScriptStep`, `ONBOARDING_SCRIPT` from `lib/onboarding/script.ts` (Task 1)
- Produces: `runOnboardingTurn(transcript, script?, client?): Promise<OnboardingTurnResult>`, used by Task 4's API route.

- [ ] **Step 1: Write the failing tests**

Create `lib/onboarding/chat.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { runOnboardingTurn } from './chat';
import { EMPTY_EXTRACTED_PROFILE } from './extraction';
import { ONBOARDING_SCRIPT } from './script';

describe('runOnboardingTurn', () => {
  it('returns the parsed output from Claude', async () => {
    const fakeClient = {
      messages: {
        parse: vi.fn().mockResolvedValue({
          parsed_output: {
            assistantReply: '¿Cómo te llamas?',
            extracted: { ...EMPTY_EXTRACTED_PROFILE },
            done: false,
          },
        }),
      },
    } as any;

    const result = await runOnboardingTurn(
      [{ role: 'user', content: 'Hola' }],
      ONBOARDING_SCRIPT,
      fakeClient
    );

    expect(result.assistantReply).toBe('¿Cómo te llamas?');
    expect(result.done).toBe(false);
    expect(fakeClient.messages.parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-5' })
    );
  });

  it('throws if Claude does not return a parsed output', async () => {
    const fakeClient = {
      messages: { parse: vi.fn().mockResolvedValue({ parsed_output: null }) },
    } as any;

    await expect(
      runOnboardingTurn([{ role: 'user', content: 'Hola' }], ONBOARDING_SCRIPT, fakeClient)
    ).rejects.toThrow('Claude no devolvió una respuesta estructurada válida');
  });

  it('includes every script topic in the system prompt', async () => {
    const fakeClient = {
      messages: {
        parse: vi.fn().mockResolvedValue({
          parsed_output: {
            assistantReply: 'ok',
            extracted: { ...EMPTY_EXTRACTED_PROFILE },
            done: false,
          },
        }),
      },
    } as any;

    await runOnboardingTurn([{ role: 'user', content: 'Hola' }], ONBOARDING_SCRIPT, fakeClient);

    const callArgs = fakeClient.messages.parse.mock.calls[0][0];
    for (const step of ONBOARDING_SCRIPT) {
      expect(callArgs.system).toContain(step.field);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/onboarding/chat.test.ts`
Expected: FAIL — `./chat` module not found.

- [ ] **Step 3: Implement runOnboardingTurn**

Create `lib/onboarding/chat.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { OnboardingTurnSchema, type OnboardingTurnResult, type ChatMessage } from './extraction';
import { ONBOARDING_SCRIPT, type OnboardingScriptStep } from './script';

const MODEL = 'claude-sonnet-5';

export async function runOnboardingTurn(
  transcript: ChatMessage[],
  script: OnboardingScriptStep[] = ONBOARDING_SCRIPT,
  client: Anthropic = new Anthropic()
): Promise<OnboardingTurnResult> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(script),
    messages: transcript.map((m) => ({ role: m.role, content: m.content })),
    output_config: { format: zodOutputFormat(OnboardingTurnSchema) },
  });

  if (!response.parsed_output) {
    throw new Error('Claude no devolvió una respuesta estructurada válida');
  }

  return response.parsed_output;
}

function buildSystemPrompt(script: OnboardingScriptStep[]): string {
  const topics = script.map((s) => `- ${s.field}: ${s.instruction}`).join('\n');
  return `Eres un guía cálido que ayuda a alguien a prepararse para recibir mensajes diarios de su "yo futuro". Debes indagar, en una conversación natural en español, sobre estos temas:
${topics}

En cada turno, responde con un JSON que tenga: "assistantReply" (un mensaje breve y natural para continuar la conversación, o para despedirte si ya terminaste), "extracted" (los datos que puedas inferir con confianza de TODA la conversación hasta ahora, usando null en lo que aún no sepas con certeza), y "done" (true solo cuando todos los temas de arriba ya tengan un valor no nulo en "extracted").`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/onboarding/chat.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding/chat.ts lib/onboarding/chat.test.ts
git commit -m "feat: add Claude-backed onboarding conversation turn"
```

---

## Task 4: Onboarding chat API route

**Files:**
- Create: `app/api/onboarding/chat/route.ts`
- Test: `app/api/onboarding/chat/route.test.ts`

**Interfaces:**
- Consumes: `createClient()` (server) from `lib/supabase/server.ts`; `runOnboardingTurn` from `lib/onboarding/chat.ts` (Task 3); `ChatMessage` from `lib/onboarding/extraction.ts` (Task 2)
- Produces: `POST /api/onboarding/chat` endpoint, used by Task 5's page.

- [ ] **Step 1: Write the failing test**

Create `app/api/onboarding/chat/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

describe('POST /api/onboarding/chat', () => {
  it('rejects requests without an authenticated session', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });

    const request = new Request('http://localhost/api/onboarding/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: [] }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/onboarding/chat/route.test.ts`
Expected: FAIL — `./route` module not found.

- [ ] **Step 3: Implement the route**

Create `app/api/onboarding/chat/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runOnboardingTurn } from '@/lib/onboarding/chat';
import type { ChatMessage } from '@/lib/onboarding/extraction';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { transcript } = (await request.json()) as { transcript: ChatMessage[] };

  try {
    const result = await runOnboardingTurn(transcript);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/onboarding/chat/route.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add app/api/onboarding
git commit -m "feat: add onboarding chat API route"
```

---

## Task 5: Onboarding chat UI + confirmation screen (replaces the 3-step form)

**Files:**
- Modify: `app/onboarding/page.tsx` (full replacement)

**Interfaces:**
- Consumes: `createClient()` (browser) from `lib/supabase/browser.ts`; `validateProfileStep`, `validateGoals`, `validateDeliveryHour` from `lib/onboarding/validate.ts` (unchanged, existing); `mergeExtracted`, `EMPTY_EXTRACTED_PROFILE`, `ChatMessage`, `ExtractedProfile` from `lib/onboarding/extraction.ts` (Task 2); `ONBOARDING_GREETING` from `lib/onboarding/script.ts` (Task 1); `FocusArea`, `Tone` from `lib/types.ts`

- [ ] **Step 1: Replace the onboarding page**

Replace the full contents of `app/onboarding/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { validateProfileStep, validateGoals, validateDeliveryHour } from '@/lib/onboarding/validate';
import {
  mergeExtracted,
  EMPTY_EXTRACTED_PROFILE,
  type ChatMessage,
  type ExtractedProfile,
} from '@/lib/onboarding/extraction';
import { ONBOARDING_GREETING } from '@/lib/onboarding/script';
import type { FocusArea, Tone } from '@/lib/types';

const fieldClass =
  'w-full rounded-lg border border-rule bg-dusk-2 px-3.5 py-2.5 text-[15px] text-parchment placeholder:text-mist focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass';
const labelClass = 'mb-1.5 block text-sm font-medium text-parchment';

export default function OnboardingPage() {
  const [transcript, setTranscript] = useState<ChatMessage[]>([
    { role: 'assistant', content: ONBOARDING_GREETING },
  ]);
  const [input, setInput] = useState('');
  const [extracted, setExtracted] = useState<ExtractedProfile>(EMPTY_EXTRACTED_PROFILE);
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage() {
    if (!input.trim() || sending) return;
    const nextTranscript = [...transcript, { role: 'user' as const, content: input.trim() }];
    setTranscript(nextTranscript);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/onboarding/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: nextTranscript }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'No se pudo continuar la conversación');
      }
      const result = await res.json();
      setExtracted((prev) => mergeExtracted(prev, result.extracted));
      setTranscript([...nextTranscript, { role: 'assistant', content: result.assistantReply }]);
      if (result.done) setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo continuar la conversación');
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return <ConfirmationScreen extracted={extracted} />;
  }

  return (
    <main className="flex flex-1 justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <p className="mb-4 font-mono text-xs tracking-[0.14em] text-brass">
          CUÉNTALE A TU YO FUTURO
        </p>
        <div className="mb-4 flex flex-col gap-3">
          {transcript.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg px-4 py-3 text-[15px] leading-relaxed ${
                m.role === 'assistant' ? 'bg-dusk-2 text-parchment' : 'ml-8 bg-brass/10 text-parchment'
              }`}
            >
              {m.content}
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-2.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendMessage();
            }}
            placeholder="Escribe tu respuesta..."
            disabled={sending}
            className={fieldClass}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={sending}
            className="shrink-0 rounded-lg bg-brass px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90 disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </div>
    </main>
  );
}

function ConfirmationScreen({ extracted }: { extracted: ExtractedProfile }) {
  const [name, setName] = useState(extracted.name ?? '');
  const [currentAge, setCurrentAge] = useState(extracted.currentAge ?? 25);
  const [futureSelfAge, setFutureSelfAge] = useState(extracted.futureSelfAge ?? 40);
  const [focusArea, setFocusArea] = useState<FocusArea>(extracted.focusArea ?? 'personal');
  const [tone, setTone] = useState<Tone>(extracted.tone ?? 'motivador');
  const [values, setValues] = useState(extracted.values ?? '');
  const [goals, setGoals] = useState<string[]>(
    extracted.goals && extracted.goals.length > 0 ? extracted.goals : ['']
  );
  const [deliveryHour, setDeliveryHour] = useState(extracted.deliveryHour ?? 8);
  const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function confirmAndSave() {
    const profileErr = validateProfileStep({ name, currentAge, futureSelfAge, focusArea, tone, values });
    if (profileErr) return setError(profileErr);
    const goalsErr = validateGoals(goals);
    if (goalsErr) return setError(goalsErr);
    const hourErr = validateDeliveryHour(deliveryHour);
    if (hourErr) return setError(hourErr);
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
    <main className="flex flex-1 justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <p className="mb-2 font-mono text-xs tracking-[0.14em] text-brass">
          ASÍ TE VAMOS A RECORDAR
        </p>
        <h1 className="mb-8 text-balance font-serif text-3xl italic text-parchment">
          Revisa y ajusta antes de empezar
        </h1>

        {error && (
          <p role="alert" className="mb-5 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="name" className={labelClass}>Tu nombre</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="currentAge" className={labelClass}>Edad actual</label>
              <input
                id="currentAge"
                type="number"
                value={currentAge}
                onChange={(e) => setCurrentAge(Number(e.target.value))}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="futureSelfAge" className={labelClass}>Edad de tu yo futuro</label>
              <input
                id="futureSelfAge"
                type="number"
                value={futureSelfAge}
                onChange={(e) => setFutureSelfAge(Number(e.target.value))}
                className={fieldClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="focusArea" className={labelClass}>Área de vida a enfocar</label>
            <select
              id="focusArea"
              value={focusArea}
              onChange={(e) => setFocusArea(e.target.value as FocusArea)}
              className={fieldClass}
            >
              <option className="bg-dusk-2 text-parchment" value="carrera">Carrera</option>
              <option className="bg-dusk-2 text-parchment" value="salud">Salud</option>
              <option className="bg-dusk-2 text-parchment" value="relaciones">Relaciones</option>
              <option className="bg-dusk-2 text-parchment" value="finanzas">Finanzas</option>
              <option className="bg-dusk-2 text-parchment" value="personal">Personal</option>
            </select>
          </div>
          <div>
            <label htmlFor="tone" className={labelClass}>Tono del mensaje</label>
            <select
              id="tone"
              value={tone}
              onChange={(e) => setTone(e.target.value as Tone)}
              className={fieldClass}
            >
              <option className="bg-dusk-2 text-parchment" value="motivador">Motivador</option>
              <option className="bg-dusk-2 text-parchment" value="exigente">Exigente</option>
              <option className="bg-dusk-2 text-parchment" value="tierno">Tierno</option>
              <option className="bg-dusk-2 text-parchment" value="directo">Directo</option>
            </select>
          </div>
          <div>
            <label htmlFor="values" className={labelClass}>Lo que valoras</label>
            <textarea
              id="values"
              value={values}
              onChange={(e) => setValues(e.target.value)}
              rows={3}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Tus metas</label>
            <div className="flex flex-col gap-2.5">
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
                  className={fieldClass}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setGoals([...goals, ''])}
              className="mt-2 rounded-lg border border-rule px-4 py-2 text-sm font-semibold text-parchment transition-colors hover:border-brass/60"
            >
              Agregar otra meta
            </button>
          </div>
          <div>
            <label htmlFor="deliveryHour" className={labelClass}>Hora de entrega (0–23)</label>
            <input
              id="deliveryHour"
              type="number"
              min={0}
              max={23}
              value={deliveryHour}
              onChange={(e) => setDeliveryHour(Number(e.target.value))}
              className={fieldClass}
            />
            <p className="mt-1.5 font-mono text-xs text-mist">
              Zona horaria detectada: <span className="text-brass">{timezone}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={confirmAndSave}
            className="mt-2 w-full rounded-lg bg-brass px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90"
          >
            Confirmar y empezar
          </button>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run the full suite and typecheck**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: all tests pass (no new tests in this task), no type errors.

- [ ] **Step 3: Manual verification**

Run `npm run dev`. Sign up a fresh test user, land on `/onboarding`, have a short back-and-forth conversation covering all 8 topics, confirm the confirmation screen pre-fills correctly, edit one field, submit, and confirm the same `profiles`/`goals` rows are created as before (check Supabase Studio) and redirect to `/dashboard` works.

- [ ] **Step 4: Commit**

```bash
git add app/onboarding/page.tsx
git commit -m "feat: replace onboarding form with a guided conversation"
```

---

## Final check

```bash
npx vitest run
npx tsc --noEmit
npm run lint
```

Expected: all pass, no type errors, no new lint errors.
