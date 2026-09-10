# YO FUTURO — Expansion Roadmap (Fases 1-4)

**Fecha:** 2026-09-09
**Estado:** Aprobado, pendiente de plan de implementación (Fase 1)
**Extiende:** `docs/superpowers/specs/2026-09-07-yo-futuro-design.md`

## Resumen

Cuatro funcionalidades nuevas sobre el MVP ya construido y desplegado:

1. Onboarding conversacional (reemplaza el formulario de 3 pasos)
2. Tareas diarias accionables (junto con el mensaje reflexivo)
3. Progreso / racha visual (nueva pantalla `/progreso`)
4. Insight del día (segundo tipo de contenido, entregado por email)

Las notificaciones push, mencionadas originalmente junto con el insight del
día, quedan explícitamente fuera de esta ronda — se tratarán como una
**Fase 5** separada, con su propio diseño, cuando se decida construirla. El
spec original ya marcaba "notificaciones push" como fuera de alcance del
MVP; esta decisión se mantiene por ahora.

## Orden de construcción y por qué

| Fase | Depende de | Bloquea a |
|---|---|---|
| 1. Onboarding conversacional | Nada (reusa `profiles`/`goals` tal cual) | Nada |
| 2. Tareas diarias | Nada nuevo (extiende el cron ya existente) | Fase 3 (para el contador completo) |
| 3. Progreso / racha | Fase 2 (contador de tareas completadas) | Nada |
| 4. Insight del día | Nada nuevo | Fase 5 (push), no incluida aquí |

Racha y contador de mensajes en la Fase 3 no dependen de nada nuevo — se
calculan hoy mismo con la tabla `messages` existente y la lógica de zona
horaria ya construida y probada (`isSameLocalDay` en
`lib/messages/delivery.ts`). Se construye después de Tareas para que la
pantalla nazca completa con sus tres métricas, no por una dependencia
técnica dura.

**Orden de implementación: 1 → 2 → 3 → 4.**

## Fase 1 — Onboarding conversacional

### Objetivo

Reemplazar `app/onboarding/page.tsx` (formulario estático de 3 pasos) por
una conversación en lenguaje natural que termine llenando exactamente los
mismos campos de `profiles` y `goals` — sin cambiar el esquema de base de
datos ni la lógica de guardado ya existente (Task 5 del plan original).

### Enfoque de extracción de datos (decisión de diseño)

Se evaluaron tres enfoques:

- **A. Structured outputs por turno (elegido).** Cada turno, Claude recibe
  el transcript completo y devuelve un JSON parcial (campos ya conocidos,
  `null` en los que faltan), el siguiente mensaje del asistente, y una
  señal `done`. Determinístico y parseable en cada paso.
- B. Máquina de estados con una extracción por paso fijo — más confiable
  por campo, pero se siente como "formulario disfrazado de chat", no una
  conversación real.
- C. Chat libre + una extracción al final — más natural, pero concentra
  todo el riesgo de error en una sola llamada grande.

Se eligió **A**, con una pantalla de confirmación/edición final antes de
guardar (red de seguridad barata contra un malentendido puntual de la
extracción — ej. calcular mal una edad relativa).

### Dónde entra el guion de preguntas

`lib/onboarding/script.ts` exporta la lista ordenada de temas/preguntas y
qué campo llena cada uno — algo como:

```ts
export interface OnboardingScriptStep {
  field: keyof ExtractedProfile;
  instruction: string; // qué debe indagar Claude en este tema, no el texto literal de la pregunta
}

export const ONBOARDING_SCRIPT: OnboardingScriptStep[] = [
  // placeholder — se reemplaza con el guion real cuando esté listo
];
```

Este archivo es el único punto de edición cuando llegue el guion real — no
toca el loop de chat, la extracción, ni el guardado.

### Archivos nuevos

- `lib/onboarding/script.ts` — guion (placeholder inicial razonable).
- `lib/onboarding/chat.ts` — `runOnboardingTurn(transcript, script, client?)`.
  Sigue el mismo patrón de inyección de dependencia que `generateMessage`
  y `sendDailyEmail` (parámetro `client: Anthropic = new Anthropic()`),
  testeable con un cliente falso.
- `app/api/onboarding/chat/route.ts` — `POST`, autenticado vía
  `createClient()` (server), sin escritura a base de datos — solo habla
  con Claude a través de `runOnboardingTurn`.
- `app/onboarding/page.tsx` — reemplazado por una UI de chat (burbujas
  usuario/asistente, input de texto). Acumula `extracted` turno a turno
  hasta `done: true`, entonces muestra la tarjeta de confirmación/edición
  (reutilizando los mismos campos editables de hoy como fallback manual),
  y al confirmar corre el mismo insert a `profiles`/`goals` que ya existe
  (sin cambios).

### Flujo de datos

1. `/onboarding` abre con el primer tema del guion como mensaje inicial
   del asistente.
2. El usuario responde en texto libre → `POST /api/onboarding/chat` con
   el transcript completo.
3. La ruta llama a `runOnboardingTurn` (guion + transcript) → Claude
   devuelve `{ assistantReply, extracted, done }`.
4. El cliente fusiona `extracted` en el estado local, agrega
   `assistantReply` al transcript, repite hasta `done`.
5. Al terminar: tarjeta de confirmación editable → al confirmar, mismo
   insert de siempre.

### Manejo de errores

Si la llamada de extracción falla, se muestra un reintento en línea sin
perder el transcript acumulado — mismo patrón que los errores de
validación ya usados en el resto de la app.

### Testing

`runOnboardingTurn` es testeable con DI igual que `generateMessage` /
`sendDailyEmail`: mocks de cliente Anthropic con respuestas canned,
verificando fusión correcta de extracción parcial y que `done` dispare
solo cuando todos los campos requeridos por el guion están completos. La
UI de chat se verifica manualmente (sin navegador disponible en el
entorno de desarrollo de este proyecto, mismo patrón que el resto de las
páginas).

### Restricciones globales que se mantienen

Modelo `claude-sonnet-5`, SDK oficial de Anthropic, todo el copy en
español, sin otro proveedor de IA.

## Fase 2 — Tareas diarias accionables (diseño de alto nivel)

**Tabla nueva `tasks`:**

```sql
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  description text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
```

RLS: select/update (solo `completed`/`completed_at`) de las propias;
insert solo vía `service_role` (cron).

**Generación:** llamada a Claude **separada** de `generateMessage` (no una
sola llamada que devuelva mensaje+tareas) — deja intacto el código de
generación del mensaje reflexivo ya endurecido en la revisión final del
MVP, a cambio de una llamada extra por usuario al día.

**UI:** checklist "Hoy también:" debajo de la carta en `/dashboard`,
mismo patrón de update client-side con RLS que ya existe para marcar
metas como logradas en `/perfil`.

## Fase 3 — Progreso / racha visual (diseño de alto nivel)

Sin tablas nuevas. Racha = días calendario locales consecutivos con fila
en `messages` (reusa `isSameLocalDay`). Mensajes = `count()` sobre
`messages`. Tareas completadas = `count()` sobre `tasks` con
`completed = true`.

Pantalla nueva `/progreso`: big-number tiles (única pantalla de la app
donde el número es el contenido principal) + calendario mensual con
puntos de actividad en color brasa.

## Fase 4 — Insight del día (diseño de alto nivel)

Se agrega columna `type` (`'reflection' | 'insight'`) a `messages` en vez
de una tabla paralela — mismo ciclo de vida, mismo patrón de
`send_status`/`email_log`. Generación y envío siguen el mismo patrón que
Fase 2: una llamada extra (`generateInsight`) y un segundo envío por
Resend, más corto. Historial distingue por tipo con un badge.

## Fuera de alcance de este roadmap

- **Fase 5 — Push notifications**: tabla `push_subscriptions`, VAPID
  keys, service worker, UI de permiso del navegador, nuevo path de envío
  en el cron. Diseño propio cuando se decida construirla.
- Edición/reanudación de una conversación de onboarding abandonada a la
  mitad (Fase 1 no persiste el transcript server-side en v1).
