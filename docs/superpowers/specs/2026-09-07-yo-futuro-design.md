# YO FUTURO — Diseño

**Fecha:** 2026-09-07
**Estado:** Aprobado, pendiente de plan de implementación

## Resumen

"YO FUTURO" es una app donde el usuario recibe un mensaje diario escrito
por su "yo futuro", generado con IA a partir de su perfil (metas, valores,
tono deseado). Incluye perfil, historial de mensajes y notificación diaria
por email. MVP simple, sin monetización ni multi-tenant a gran escala.

## Stack

- **Frontend/Backend:** Next.js (App Router) + TypeScript, Tailwind
- **Datos/Auth:** Supabase (Postgres + Auth con email/contraseña + RLS)
- **Email transaccional:** Resend
- **Generación de mensajes:** API de Claude (Anthropic SDK), modelo
  `claude-sonnet-5` por defecto (buen balance costo/calidad para textos
  cortos generados diariamente; se puede subir a `claude-opus-5` si la
  calidad no convence)
- **Scheduling:** Vercel Cron (invocación horaria)
- **Despliegue:** Vercel

## Modelo de datos (Supabase / Postgres)

### `profiles` (1:1 con `auth.users`)
- `id` (uuid, FK a `auth.users.id`, PK)
- `name` (text)
- `current_age` (int)
- `future_self_age` (int) — a qué edad futura le "habla" el mensaje
- `values` (text) — qué valora el usuario
- `focus_area` (enum: carrera, salud, relaciones, finanzas, personal)
- `tone` (enum: motivador, exigente, tierno, directo)
- `delivery_hour_local` (int 0-23) — hora preferida de envío
- `timezone` (text, ej. `America/Mexico_City`)
- `onboarding_completed` (bool, default false)
- `created_at`, `updated_at` (timestamptz)

### `goals`
- `id` (uuid, PK)
- `user_id` (uuid, FK a `auth.users.id`, `ON DELETE CASCADE`)
- `description` (text)
- `status` (enum: active, achieved, paused — default `active`)
- `created_at` (timestamptz)

### `messages`
- `id` (uuid, PK)
- `user_id` (uuid, FK a `auth.users.id`, `ON DELETE CASCADE`)
- `content` (text) — el mensaje generado
- `generated_at` (timestamptz)
- `sent_at` (timestamptz, nullable)
- `send_status` (enum: pending, sent, failed)
- `model_used` (text) — para auditoría de costos

### `email_log`
- `id` (uuid, PK)
- `message_id` (uuid, FK a `messages.id`)
- `provider_id` (text, id de Resend)
- `status` (text)
- `error` (text, nullable)
- `created_at` (timestamptz)

### RLS
- Cada usuario puede leer/escribir solo su propio `profiles`, `goals`, y
  leer solo sus propios `messages`.
- Las rutas de cron usan la `service_role` key (bypassa RLS) porque
  operan sobre todos los usuarios.

## Páginas y flujo de usuario

- `/` — landing pública (qué es la app, CTA a registro/login)
- `/login`, `/signup` — email + contraseña vía Supabase Auth
- `/onboarding` — formulario multi-paso: datos de perfil, metas iniciales
  (agregar varias), tono, hora de entrega, zona horaria. Al terminar,
  marca `onboarding_completed = true`.
- `/dashboard` — mensaje del día más reciente, accesos a historial/perfil
- `/historial` — lista cronológica paginada de mensajes pasados.
  **Estado vacío:** si el usuario no tiene mensajes aún (recién
  registrado, no le ha tocado su primer envío), se muestra copy tipo
  *"Tu yo futuro todavía no te ha escrito — tu primer mensaje llegará a
  las [hora] de [zona horaria]"* en vez de una lista en blanco.
- `/perfil` — edición de datos de perfil, gestión de metas (agregar,
  marcar como lograda/pausada), configuración de hora/zona de entrega
  (cubre "notificaciones", no hay página separada). Incluye:
  - **Cerrar sesión** (`supabase.auth.signOut()`)
  - **Eliminar cuenta**: modal de confirmación ("escribe ELIMINAR") →
    llama a `POST /api/account/delete`, que usa `service_role` para
    `supabase.auth.admin.deleteUser(userId)`. Las tablas `profiles`,
    `goals`, `messages` se limpian solas por `ON DELETE CASCADE`.

Rutas protegidas vía middleware de Next.js que verifica sesión de
Supabase; sin sesión → redirect a `/login`.

## Flujo de generación y envío (Cron + API Route)

1. **Vercel Cron** (`vercel.json`) invoca `GET /api/cron/send-messages`
   cada hora en punto.
2. La ruta valida un header secreto (`CRON_SECRET`) — no es invocable
   públicamente.
3. Consulta (con `service_role`) los perfiles con
   `onboarding_completed = true` cuyo `delivery_hour_local` corresponde
   a la hora UTC actual convertida a su `timezone`.
4. Para cada usuario (en paralelo, con límite de concurrencia):
   a. Arma un prompt con perfil + metas `active` + últimos 1-2 mensajes
      anteriores (para evitar repetición de tono/contenido).
   b. Llama a la API de Claude (`claude-sonnet-5`).
   c. Guarda el mensaje en `messages` (`send_status = pending`).
   d. Envía el email vía Resend.
   e. Actualiza `send_status` a `sent` o `failed`, registra en
      `email_log`.
5. Errores de un usuario individual no detienen el batch (try/catch por
   usuario, con logging).

### Manejo de errores
- Si Claude falla (rate limit, timeout): 1 reintento; si vuelve a
  fallar, se marca `failed` y se reintenta en la siguiente corrida.
- Si el email falla pero el mensaje sí se generó: el mensaje queda
  visible en `/historial` aunque el correo no haya llegado — el usuario
  no pierde el contenido.

## Testing

- Unit tests (Vitest) para: construcción del prompt a partir de
  perfil/metas, lógica de "¿a este usuario le toca ahora?" (conversión
  de zona horaria), helpers de la capa de datos.
- Se mockea la API de Claude y Resend en tests — nunca se llama a la
  API real en CI.
- Prueba manual end-to-end antes de lanzar: crear usuario de prueba,
  forzar ejecución del cron con su `delivery_hour_local` en la hora
  actual, verificar que llega el email y aparece en `/historial`.

## Variables de entorno

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`

## Despliegue

- Deploy en Vercel conectado al repo; variables de entorno en el
  dashboard de Vercel.
- Migraciones de Supabase versionadas con el CLI de Supabase
  (`supabase/migrations`).

## Fuera de alcance (MVP)

- Notificaciones push
- Planes de pago / monetización
- Selección de proveedor de IA distinto a Claude
- Check-ins periódicos de progreso de metas
