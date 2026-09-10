# Onboarding Script Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder 8-topic onboarding script with the real 17-step emotional-diagnostic script, add 3 AI-synthesized narrative results ("Tu energía actual", "El patrón que te detiene", "Quién quieres ser") shown on their own screen before the confirmation form, and update `focus_area` to the script's real 4-option taxonomy.

**Architecture:** No change to the turn-by-turn extraction architecture (`client.messages.parse` + Zod, approved in Fase 1). `OnboardingScriptStep` drops its `field` property — script steps become ordered conversation instructions, decoupled from the fixed list of fields Claude must fill before `done`. Three new nullable text columns on `profiles` store the narrative results, populated once at save time alongside the existing structured fields. A new `ResultsScreen` sits between the chat and the existing `ConfirmationScreen`.

**Tech Stack:** Next.js (App Router, TypeScript), `@anthropic-ai/sdk` (`client.messages.parse` + Zod structured outputs, already in place), Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-yo-futuro-expansion-roadmap.md` ("Fase 1 — Revisión: guion real + resultados narrativos" section)

## Global Constraints

- AI model: `claude-sonnet-5`, via the official `@anthropic-ai/sdk` — unchanged.
- All UI copy and the conversation itself are in Spanish.
- `deliveryHour`/`timezone` are NEVER asked conversationally — they stay editable-only on the confirmation screen, exactly as today. They must NOT be added to the "required for done" field list.
- `tone` is never asked as an explicit question — Claude infers it from the conversation's emotional register, per the spec's explicit decision.
- The 3 new narrative fields (`currentEnergySummary`, `blockingPattern`, `futureVision`) must be genuinely synthesized by Claude from the real conversation each time — never hardcoded/templated text anywhere in the code.
- `focus_area`'s existing enum values (`carrera`, `salud`, `relaciones`, `finanzas`, `personal`) are never removed from the database or the TypeScript type — only `paz` and `cuerpo` are added. The confirmation screen's UI only *offers* the 4 new options as choices; the wider validation universe (all 7 values) stays valid at the type/schema level.
- Every existing test that doesn't reference something this plan changes must keep passing unmodified.

---

## Task 1: Database migration + shared types

**Files:**
- Create: `supabase/migrations/0002_focus_area_energy_fields.sql`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: 3 new nullable columns on `profiles` (`current_energy_summary`, `blocking_pattern`, `future_vision`); `FocusArea` type extended with `'paz' | 'cuerpo'`; `Profile` interface extended with the 3 new fields — consumed by Task 2 (extraction schema) and Task 5 (the save insert and the confirmation screen's select).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0002_focus_area_energy_fields.sql`:

```sql
alter type focus_area add value if not exists 'paz';
alter type focus_area add value if not exists 'cuerpo';

alter table profiles add column if not exists current_energy_summary text;
alter table profiles add column if not exists blocking_pattern text;
alter table profiles add column if not exists future_vision text;
```

- [ ] **Step 2: Apply it locally if a Supabase stack is available**

Run: `supabase db reset` (if the Supabase CLI and Docker are available in this environment — if not, note it in your report and defer local verification to the user, same as this project's established pattern for schema tasks).

- [ ] **Step 3: Update the shared types**

In `lib/types.ts`, change line 1 from:

```ts
export type FocusArea = 'carrera' | 'salud' | 'relaciones' | 'finanzas' | 'personal';
```

to:

```ts
export type FocusArea = 'carrera' | 'salud' | 'relaciones' | 'finanzas' | 'personal' | 'paz' | 'cuerpo';
```

And add 3 fields to the `Profile` interface, immediately after `timezone: string;` and before `onboarding_completed: boolean;`... actually place them after `onboarding_completed: boolean;` and before `created_at: string;` so the full interface reads:

```ts
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
  current_energy_summary: string | null;
  blocking_pattern: string | null;
  future_vision: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_focus_area_energy_fields.sql lib/types.ts
git commit -m "feat: add focus_area options and narrative result columns"
```

---

## Task 2: Extraction schema updates

**Files:**
- Modify: `lib/onboarding/extraction.ts`
- Modify: `lib/onboarding/extraction.test.ts`

**Interfaces:**
- Consumes: `FocusArea`, `Tone` are NOT directly imported here (the schema uses its own literal enum lists, per the existing pattern) — but the enum value lists below must match Task 1's `FocusArea` type additions exactly.
- Produces: `ExtractedProfile` (and the raw/normalize pair) extended with `currentEnergySummary: string | null`, `blockingPattern: string | null`, `futureVision: string | null` — consumed by Task 4 (`chat.ts`) and Task 5 (`page.tsx`, the results screen and the save insert).

- [ ] **Step 1: Update the schemas and EMPTY_EXTRACTED_PROFILE**

In `lib/onboarding/extraction.ts`, replace the `ExtractedProfileSchema` definition with:

```ts
export const ExtractedProfileSchema = z.object({
  name: z.string().nullable(),
  currentAge: z.number().int().nullable(),
  futureSelfAge: z.number().int().nullable(),
  focusArea: z.enum(['carrera', 'salud', 'relaciones', 'finanzas', 'personal', 'paz', 'cuerpo']).nullable(),
  tone: z.enum(['motivador', 'exigente', 'tierno', 'directo']).nullable(),
  values: z.string().nullable(),
  goals: z.array(z.string()).nullable(),
  deliveryHour: z.number().int().nullable(),
  currentEnergySummary: z.string().nullable(),
  blockingPattern: z.string().nullable(),
  futureVision: z.string().nullable(),
});
```

Replace the `RawExtractedProfileSchema` definition with:

```ts
const RawExtractedProfileSchema = z.object({
  name: z.string().nullable(),
  currentAge: z.number().int().nullable(),
  futureSelfAge: z.number().int().nullable(),
  focusArea: z.string().nullable(),
  tone: z.string().nullable(),
  values: z.string().nullable(),
  goals: z.array(z.string()).nullable(),
  deliveryHour: z.number().int().nullable(),
  currentEnergySummary: z.string().nullable(),
  blockingPattern: z.string().nullable(),
  futureVision: z.string().nullable(),
});
```

Replace the `VALID_FOCUS_AREAS` constant with:

```ts
const VALID_FOCUS_AREAS = ['carrera', 'salud', 'relaciones', 'finanzas', 'personal', 'paz', 'cuerpo'] as const;
```

(`VALID_TONES` stays unchanged.)

Replace `EMPTY_EXTRACTED_PROFILE` with:

```ts
export const EMPTY_EXTRACTED_PROFILE: ExtractedProfile = {
  name: null,
  currentAge: null,
  futureSelfAge: null,
  focusArea: null,
  tone: null,
  values: null,
  goals: null,
  deliveryHour: null,
  currentEnergySummary: null,
  blockingPattern: null,
  futureVision: null,
};
```

`normalizeRawTurn` and `mergeExtracted` need NO code changes — both already operate generically over `Object.keys(...)`/spread, so they automatically handle the 3 new fields.

- [ ] **Step 2: Add a test for the new fields' merge behavior**

Add to `lib/onboarding/extraction.test.ts`, inside the `describe('mergeExtracted', ...)` block:

```ts
  it('merges newly-extracted narrative fields the same way as any other field', () => {
    const prev = EMPTY_EXTRACTED_PROFILE;
    const next: ExtractedProfile = {
      ...EMPTY_EXTRACTED_PROFILE,
      blockingPattern: 'Evita hablar de dinero cuando se siente ansioso.',
    };
    const merged = mergeExtracted(prev, next);
    expect(merged.blockingPattern).toBe('Evita hablar de dinero cuando se siente ansioso.');
  });
```

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: all existing tests still pass (the ones touching `focusArea: 'salud'` etc. remain valid since no enum value was removed), the new test passes, no type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/onboarding/extraction.ts lib/onboarding/extraction.test.ts
git commit -m "feat: extend onboarding extraction schema with narrative fields and new focus areas"
```

---

## Task 3: Real onboarding script (17 steps)

**Files:**
- Modify: `lib/onboarding/script.ts`

**Interfaces:**
- Produces: `OnboardingScriptStep` (now `{ instruction: string }`, no `field` property — this is a breaking change to the type, consumed by Task 4's `chat.ts`), `ONBOARDING_SCRIPT: OnboardingScriptStep[]` (17 entries), `ONBOARDING_GREETING: string`.

- [ ] **Step 1: Replace the script file**

Replace the full contents of `lib/onboarding/script.ts`:

```ts
export interface OnboardingScriptStep {
  instruction: string;
}

export const ONBOARDING_GREETING =
  'Hola. Antes de escribirte tu primer mensaje, quiero conocerte un poco. Para empezar, ¿cómo te llamas?';

export const ONBOARDING_SCRIPT: OnboardingScriptStep[] = [
  { instruction: 'Pregunta su nombre, de forma casual, como abriendo la conversación.' },
  { instruction: 'Pregunta su edad actual.' },
  {
    instruction:
      'Pregunta a qué edad quiere que le hable su yo futuro (debe ser mayor que su edad actual).',
  },
  {
    instruction:
      'Pregúntale qué es lo que más quiere trabajar, dándole a elegir entre: Dinero y abundancia, Amor y relaciones, Paz, o Mi cuerpo.',
  },
  { instruction: 'Pregúntale qué es lo que más quiere cambiar de lo que acaba de elegir.' },
  {
    instruction:
      'Pídele que te lleve a la memoria con mayor intensidad emocional negativa que tenga relacionada a esto: cómo lo vivió, cómo creció, con quién, cómo era su vida.',
  },
  {
    instruction:
      'Pregúntale qué ejemplos seguía más al crecer, a quién quería agradar más, de quién buscaba más el amor y la aceptación.',
  },
  {
    instruction:
      'Pregúntale cómo se veía su relación con esto día a día, pidiéndole que sea lo más honesto posible.',
  },
  {
    instruction:
      'Pregúntale dónde está su sistema nervioso hoy en relación a esto, qué emociones siente cuando se relaciona con ello.',
  },
  {
    instruction:
      'Pregúntale qué emociones sentía cuando las cosas iban bien en esta área, qué hacía y cómo lo hacía.',
  },
  {
    instruction:
      'Reconoce que va bien, que está a la mitad del proceso — un punto de aliento antes de seguir.',
  },
  {
    instruction:
      'Pídele el acontecimiento de mayor estrés o dolor emocional que haya vivido relacionado a esto, con el mayor detalle posible.',
  },
  { instruction: 'Pregúntale qué hace cuando las cosas no salen como quiere.' },
  {
    instruction:
      'Pregúntale dónde quiere estar en esta área en 6 meses, en 1 año, cuál es su visión a largo plazo.',
  },
  {
    instruction:
      'Pídele que describa la versión de sí misma viviendo su realidad deseada: cómo es su personalidad, cómo piensa, cómo se comporta.',
  },
  {
    instruction:
      'Pregúntale si quiere ser consistente con esa versión de sí misma y vivir su realidad deseada.',
  },
  {
    instruction:
      'Pregúntale si quiere dejar de caer y regresar una y otra vez a los patrones que le impiden vivir su realidad deseada.',
  },
];
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: errors in `lib/onboarding/chat.ts` and `lib/onboarding/chat.test.ts` (both still reference the removed `field` property) — this is expected, Task 4 fixes them. Confirm no OTHER unrelated errors appear.

- [ ] **Step 3: Commit**

```bash
git add lib/onboarding/script.ts
git commit -m "feat: replace placeholder onboarding script with the real 17-step guide"
```

(A red `tsc --noEmit` in the rest of the codebase between this commit and Task 4's is expected and acceptable — this plan's tasks are dispatched and reviewed in order, so this intermediate state is never the final state of a review.)

---

## Task 4: Conversation prompt rework

**Files:**
- Modify: `lib/onboarding/chat.ts`
- Modify: `lib/onboarding/chat.test.ts`

**Interfaces:**
- Consumes: `OnboardingScriptStep` (now `{ instruction: string }`) from `lib/onboarding/script.ts` (Task 3); `ExtractedProfile` (now with the 3 narrative fields) from `lib/onboarding/extraction.ts` (Task 2).
- Produces: `runOnboardingTurn`'s exported signature is UNCHANGED — only `buildSystemPrompt`'s internals change.

- [ ] **Step 1: Update buildSystemPrompt**

In `lib/onboarding/chat.ts`, replace the `buildSystemPrompt` function (and add the `REQUIRED_FIELDS` constant above it) with:

```ts
const REQUIRED_FIELDS = [
  'name',
  'currentAge',
  'futureSelfAge',
  'focusArea',
  'tone',
  'values',
  'goals',
  'currentEnergySummary',
  'blockingPattern',
  'futureVision',
] as const;

function buildSystemPrompt(script: OnboardingScriptStep[]): string {
  const steps = script.map((s, i) => `${i + 1}. ${s.instruction}`).join('\n');
  return `Eres un guía cálido que ayuda a alguien a prepararse para recibir mensajes diarios de su "yo futuro", a través de una conversación profunda y progresiva en español. Sigue este guion en orden, una pregunta a la vez, dejando que cada respuesta informe la siguiente:
${steps}

No preguntes por el tono que prefiere para los mensajes (motivador, exigente, tierno o directo) — infiérelo tú del registro emocional de toda la conversación.

Cuando ya hayas recorrido el guion completo, sintetiza tres textos narrativos a partir de TODO lo que la persona compartió (nunca texto genérico ni plantillas fijas):
- "currentEnergySummary": un diagnóstico breve de dónde está la persona hoy en esta área de su vida.
- "blockingPattern": el patrón que la detiene, basado en sus recuerdos de mayor intensidad emocional, su relación día a día con el tema, y sus momentos de mayor estrés.
- "futureVision": quién quiere llegar a ser, basado en su visión a futuro y en cómo describió a esa versión de sí misma.

En cada turno, responde con un JSON que tenga: "assistantReply" (un mensaje breve, cálido y natural para continuar la conversación, o para cerrarla una vez sintetizados los tres textos), "extracted" (todos los datos que puedas inferir con confianza de TODA la conversación hasta ahora, usando null en lo que aún no sepas con certeza), y "done" (true solo cuando estos campos ya tengan un valor no nulo en "extracted": ${REQUIRED_FIELDS.join(', ')}).`;
}
```

Nothing else in `chat.ts` changes — `runOnboardingTurn`'s body, the try/catch, `normalizeRawTurn` call, and the leading-assistant-message trimming all stay exactly as they are.

- [ ] **Step 2: Fix the system-prompt test that referenced the removed `field` property**

In `lib/onboarding/chat.test.ts`, replace the `'includes every script topic in the system prompt'` test with:

```ts
  it('includes every script step in the system prompt, in order', async () => {
    const parse = resolvingParse(okTurn());

    await runOnboardingTurn(
      [{ role: 'user', content: 'Hola' }],
      ONBOARDING_SCRIPT,
      fakeClient(parse)
    );

    const callArgs = parse.mock.calls[0][0];
    for (const step of ONBOARDING_SCRIPT) {
      expect(callArgs.system).toContain(step.instruction);
    }
  });

  it('lists every required field for the done condition, excluding deliveryHour', async () => {
    const parse = resolvingParse(okTurn());

    await runOnboardingTurn(
      [{ role: 'user', content: 'Hola' }],
      ONBOARDING_SCRIPT,
      fakeClient(parse)
    );

    const system = parse.mock.calls[0][0].system as string;
    for (const field of [
      'name',
      'currentAge',
      'futureSelfAge',
      'focusArea',
      'tone',
      'values',
      'goals',
      'currentEnergySummary',
      'blockingPattern',
      'futureVision',
    ]) {
      expect(system).toContain(field);
    }
    expect(system).not.toContain('deliveryHour');
  });
```

Leave every other test in the file untouched — they don't reference `step.field` and remain valid as-is (the `'keeps a valid focusArea and tone as-is'` test uses `'salud'`, which is still a valid enum value).

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: all tests pass, no type errors (this resolves the expected red state from Task 3).

- [ ] **Step 4: Commit**

```bash
git add lib/onboarding/chat.ts lib/onboarding/chat.test.ts
git commit -m "feat: rework the onboarding system prompt for the real script and narrative synthesis"
```

---

## Task 5: Results screen + confirmation screen updates

**Files:**
- Modify: `app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `ExtractedProfile` (now with 3 narrative fields) from `lib/onboarding/extraction.ts` (Task 2); `FocusArea` (now with `'paz' | 'cuerpo'`) from `lib/types.ts` (Task 1).

- [ ] **Step 1: Add a results screen between the chat and the confirmation screen**

In `app/onboarding/page.tsx`, add a `resultsConfirmed` state variable to `OnboardingPage` (alongside the existing `done` state):

```ts
  const [resultsConfirmed, setResultsConfirmed] = useState(false);
```

Replace the existing `if (done) { return <ConfirmationScreen extracted={extracted} />; }` block with:

```ts
  if (done && !resultsConfirmed) {
    return <ResultsScreen extracted={extracted} onContinue={() => setResultsConfirmed(true)} />;
  }

  if (done) {
    return <ConfirmationScreen extracted={extracted} />;
  }
```

Add two new components at the end of the file (after `ConfirmationScreen`'s closing brace):

```tsx
function ResultsScreen({
  extracted,
  onContinue,
}: {
  extracted: ExtractedProfile;
  onContinue: () => void;
}) {
  return (
    <main className="flex flex-1 justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <p className="mb-2 font-mono text-xs tracking-[0.14em] text-brass">TU RADIOGRAFÍA</p>
        <h1 className="mb-8 font-serif text-3xl text-parchment">Esto es lo que encontramos</h1>

        <div className="flex flex-col gap-6">
          <ResultCard title="Tu energía actual" content={extracted.currentEnergySummary} />
          <ResultCard title="El patrón que te detiene" content={extracted.blockingPattern} />
          <ResultCard title="Quién quieres ser" content={extracted.futureVision} />
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="mt-8 w-full rounded-lg bg-brass px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90"
        >
          Continuar
        </button>
      </div>
    </main>
  );
}

function ResultCard({ title, content }: { title: string; content: string | null }) {
  return (
    <div className="rounded border-t-2 border-brass-dim bg-dusk-2 px-7 py-8">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.08em] text-mist">{title}</p>
      <p className="whitespace-pre-line font-serif text-lg italic leading-relaxed text-parchment">
        {content ?? 'No pudimos generar esta sección — puedes continuar de todas formas.'}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Update the confirmation screen's focus-area options and default**

In `ConfirmationScreen`, change the `focusArea` state's default fallback from `'personal'` to `'finanzas'`:

```ts
  const [focusArea, setFocusArea] = useState<FocusArea>(extracted.focusArea ?? 'finanzas');
```

Replace the `focusArea` `<select>`'s 5 `<option>` elements with the script's real 4 choices:

```tsx
              <option className="bg-dusk-2 text-parchment" value="finanzas">Dinero y abundancia</option>
              <option className="bg-dusk-2 text-parchment" value="relaciones">Amor y relaciones</option>
              <option className="bg-dusk-2 text-parchment" value="paz">Paz</option>
              <option className="bg-dusk-2 text-parchment" value="cuerpo">Mi cuerpo</option>
```

- [ ] **Step 3: Save the 3 narrative fields alongside the existing insert**

In `ConfirmationScreen`'s `confirmAndSave`, add the 3 narrative fields to the existing `profiles` insert call (which currently ends with `onboarding_completed: true,`):

```ts
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
      current_energy_summary: extracted.currentEnergySummary,
      blocking_pattern: extracted.blockingPattern,
      future_vision: extracted.futureVision,
    });
```

(`extracted` is already a prop of `ConfirmationScreen` — no new prop needed.)

- [ ] **Step 4: Run the full test suite and typecheck**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: all tests pass (no new tests in this task — UI page, consistent with the rest of this app), no type errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`. Sign up a fresh test user, land on `/onboarding`, have a conversation covering all 17 steps (or use the "Ya terminé, revisar mis datos" escape hatch partway through to test the degraded-data path), confirm the results screen shows the 3 narrative sections (or their fallback text if `null`), click "Continuar", confirm the confirmation screen now offers the 4 new focus-area options, submit, and confirm in Supabase Studio that `profiles` has the 3 new narrative columns populated.

- [ ] **Step 6: Commit**

```bash
git add app/onboarding/page.tsx
git commit -m "feat: add results screen and update focus-area options for the real script"
```

---

## Final check

```bash
npx vitest run
npx tsc --noEmit
npm run lint
```

Expected: all pass, no type errors, no new lint errors.
