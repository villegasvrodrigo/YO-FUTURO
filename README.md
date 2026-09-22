# YO FUTURO

YO FUTURO es una app donde cada usuario recibe un mensaje diario escrito por su
"yo futuro". El usuario completa un onboarding (edad actual, edad futura,
valores, área de foco, tono y hora de entrega en su zona horaria) y registra sus
metas; un cron horario de Vercel busca a quién le toca a esa hora local, arma un
prompt con su perfil, sus metas activas y sus últimos mensajes, genera el texto
con la API de Claude y lo envía por email vía Resend. Los mensajes quedan
guardados y visibles en `/dashboard` y `/historial` aunque el correo falle.

**Stack:** Next.js (App Router) + TypeScript · Supabase (Postgres, Auth, RLS) ·
Anthropic SDK · Resend · Vercel Cron.

## Variables de entorno

Copia `.env.example` a `.env.local` y rellena las seis variables:

| Variable | Para qué sirve |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase. La usan el cliente de navegador, el de servidor y el middleware. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública (anon) de Supabase. Todas las lecturas/escrituras que hace pasan por RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave `service_role`, sólo servidor. La usa el cron para leer perfiles de todos los usuarios y escribir `messages` / `email_log` saltándose RLS. Nunca la expongas al cliente. |
| `ANTHROPIC_API_KEY` | Autentica las llamadas a la API de Claude que generan el mensaje diario. |
| `RESEND_API_KEY` | Autentica el envío de emails vía Resend. |
| `RESEND_FROM_ADDRESS` | Opcional. Remitente de los emails (ej. `Yo Futuro <hola@tudominio.com>`). Si no se define, usa `Yo Futuro <hola@yofuturo.app>` por defecto. Útil para probar con el remitente de pruebas de Resend (`onboarding@resend.dev`) antes de verificar un dominio propio. |
| `CRON_SECRET` | Secreto que valida el header `Authorization` de la ruta de cron, para que no sea invocable públicamente. |
| `SITE_URL` | Opcional. Dirección pública del sitio, sin `/` final (ej. `https://yofuturo.rodrigovillegasvilla.com`). El correo diario termina con `Marca tus tareas en <SITE_URL>/dashboard`. Si no se define o no es una dirección `http(s)` válida, usa `https://yofuturo.rodrigovillegasvilla.com`. |

## Base de datos

El esquema vive en `supabase/migrations/`. En local:

```bash
supabase db reset   # aplica las migraciones sobre el stack local
```

Para aplicarlo a un proyecto real de Supabase (esto **no** se ha corrido nunca
contra producción en este repo — sólo `db reset` en local):

```bash
supabase link --project-ref <tu-project-ref>
supabase db push
```

## Configuración requerida de Supabase Auth

Si el proyecto de Supabase tiene **"Confirm email" activado** (es el valor por
defecto), `supabase.auth.signUp` devuelve éxito **sin sesión**: el usuario debe
abrir el enlace de confirmación de su correo antes de poder entrar. La página de
registro detecta ese caso y muestra "Revisa tu correo para confirmar tu cuenta
antes de continuar" en lugar de redirigir. **Es el comportamiento esperado, no un
bug.** Si prefieres que el registro entregue sesión inmediata, desactiva "Confirm
email" en Authentication → Providers → Email.

## Configuración requerida de Resend

El remitente está fijado en `lib/email/send.ts` como
`Yo Futuro <hola@yofuturo.app>`. Ese dominio tiene que estar **verificado en el
dashboard de Resend** (Domains → Add Domain, y añadir los registros DNS) o los
envíos reales fallarán. Cámbialo si usas otro dominio.

## Cron: GitHub Actions, no Vercel

El plan Hobby de Vercel solo permite cron jobs una vez al día (y sin hora exacta),
pero esta app necesita revisar cada hora quién tiene su entrega en curso — por eso
`GET /api/cron/send-messages` NO se registra en `vercel.json`. En su lugar,
`.github/workflows/cron-send-messages.yml` corre cada hora en punto (y también se
puede disparar a mano desde la pestaña Actions de GitHub) y llama a esa ruta con
`Authorization: Bearer <CRON_SECRET>`.

Para que funcione, el repositorio de GitHub necesita estos dos secretos
(Settings → Secrets and variables → Actions):

| Secreto | Valor |
| --- | --- |
| `CRON_TARGET_URL` | La URL base del despliegue en Vercel, sin `/` al final (ej. `https://tu-app.vercel.app`) |
| `CRON_SECRET` | El mismo valor configurado como variable de entorno `CRON_SECRET` en el proyecto de Vercel |

Si la variable `CRON_SECRET` no coincide entre GitHub y Vercel, la ruta rechaza la
petición con 401 y el workflow falla de forma visible en la pestaña Actions.

## Desarrollo y tests

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # suite de Vitest (vitest run)
npx tsc --noEmit     # typecheck
npm run lint         # ESLint
```

Los tests nunca llaman a Claude, Resend ni Supabase de verdad: se inyectan
clientes falsos o se mockean los módulos.
