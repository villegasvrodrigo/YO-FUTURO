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

## Fase 1 — Revisión: guion real + resultados narrativos (2026-09-10)

Fase 1 ya está implementada y en producción con un guion placeholder de 8
temas. Esta revisión reemplaza ese placeholder con el guion real (17 pasos)
y agrega 3 resultados narrativos generados al final. Cambia el modelo de
datos y el flujo de pantallas; no cambia la arquitectura de extracción por
turno (`client.messages.parse` + Zod) ya aprobada.

### Modelo de `OnboardingScriptStep` — de "un tema por campo" a "pasos de conversación"

El guion real no mapea 1:1 tema→campo como el placeholder original: la
mayoría de las 17 preguntas alimentan una síntesis final (los 3
resultados), no un campo estructurado individual. `OnboardingScriptStep`
pierde su propiedad `field` — se vuelve una lista ordenada de
instrucciones de conversación (qué indagar en cada turno), separada de la
lista fija de campos que el sistema debe intentar llenar antes de marcar
`done` (ver más abajo). Esto no cambia el punto de inserción del guion:
sigue siendo edición aislada de `lib/onboarding/script.ts`.

### Modelo de datos — 3 columnas nuevas en `profiles`

```sql
alter table profiles add column current_energy_summary text;
alter table profiles add column blocking_pattern text;
alter table profiles add column future_vision text;
```

Nullable, 1:1 con el usuario (igual que `values`), sin tabla nueva —
generadas una sola vez al final de la conversación. Quedan disponibles
para enriquecer el prompt del mensaje diario en fases futuras (no se usa
todavía).

### `focus_area` — no es "agregar una opción", es un cambio de taxonomía

La pregunta 1 del guion real da 4 opciones (Dinero y abundancia / Amor y
relaciones / Paz / Mi cuerpo) que no coinciden con el enum de 5 valores ya
en producción (`carrera, salud, relaciones, finanzas, personal`).
Migración aditiva, sin borrar valores existentes:

```sql
alter type focus_area add value 'paz';
alter type focus_area add value 'cuerpo';
```

Mapeo de las opciones del guion a valores del enum:

| Opción del guion | Valor del enum |
|---|---|
| Dinero y abundancia | `finanzas` (existente, se reusa) |
| Amor y relaciones | `relaciones` (existente, se reusa) |
| Paz | `paz` (nuevo) |
| Mi cuerpo | `cuerpo` (nuevo) |

`carrera`, `salud`, `personal` quedan en el enum sin usarse — sin riesgo,
sin necesidad de recrear el tipo.

### Campos que el guion real no cubre — decisiones

El guion de 14 preguntas nunca pregunta `name`, `currentAge`,
`futureSelfAge`, `tone`, `deliveryHour` ni `timezone`. Decisiones:

- **`deliveryHour`/`timezone`**: sin cambio — se llenan en la pantalla de
  confirmación/edición como ya ocurre hoy, con el mismo default.
- **`name`, `currentAge`, `futureSelfAge`**: se agregan 3 pasos ligeros al
  inicio del guion, antes de las 14 preguntas del diagnóstico emocional,
  como apertura casual de la conversación.
- **`tone`**: no se pregunta explícitamente — Claude lo infiere del
  registro emocional de toda la conversación (uno de los 4 valores ya
  existentes: motivador, exigente, tierno, directo) y lo entrega como un
  campo más de la extracción. Queda editable en la confirmación si Claude
  se equivoca.

### 3 resultados narrativos — generación y presentación

Al llegar a `done`, además de los campos estructurados de siempre, Claude
entrega 3 textos narrativos nuevos: `currentEnergySummary` ("Tu energía
actual"), `blockingPattern` ("El patrón que te detiene", sintetizado de
las preguntas de memoria emocional, relación día a día, y momentos de
estrés) y `futureVision` ("Quién quieres ser", sintetizado de las
preguntas de visión a futuro). Generados dinámicamente por Claude a partir
de las respuestas reales — nunca texto fijo.

**Flujo de pantallas revisado:**

1. Chat (sin cambio en su mecánica: turno a turno, `mergeExtracted`, botón
   manual de salida ya existente).
2. Al llegar a `done` → **pantalla nueva de resultados**: los 3 textos en
   su propio apartado, tratamiento visual "carta" de Papel y Brasa (serif
   cursiva sobre superficie `dusk-2` con acento `brass-dim`, igual que el
   mensaje diario en `/dashboard`), solo lectura, botón "Continuar".
3. Pantalla de confirmación/edición (sin cambio de lógica de guardado) —
   ahora incluye `focus_area` con las 4 opciones nuevas del guion en vez
   de las 5 anteriores.
4. Guardar → mismo insert de siempre a `profiles`/`goals`, más los 3
   campos narrativos nuevos.

### Restricciones globales (sin cambio)

Modelo `claude-sonnet-5`, SDK oficial de Anthropic, todo el copy en
español. El patrón de esquema-crudo + normalización para valores fuera de
enum (agregado en la ronda de correcciones de la revisión final de Fase 1)
se mantiene y se extiende a los 2 valores nuevos de `focus_area`.

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
