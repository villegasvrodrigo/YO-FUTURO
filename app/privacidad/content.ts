// The text of the privacy notice, kept apart from the page so it can be edited without
// touching the layout. Format, one block per blank-line-separated chunk:
// - a block starting with "## " is a section title;
// - a block whose lines all start with "- " is a bulleted list;
// - anything else is a paragraph (its line breaks are joined with spaces).
// Email addresses become links automatically.

// The notice's own first title; the page shows it as its main heading.
export const PRIVACY_TITLE = 'Aviso de privacidad';

export const PRIVACY_TEXT = `Última actualización: 23 de septiembre de 2026

Yo Futuro es un proyecto personal en fase de prueba. Este aviso explica en palabras simples qué datos guardo, para qué, y cómo puedes borrarlos.

## Qué guardo:

Cuando creas tu cuenta: tu correo electrónico y tu contraseña (cifrada; nadie, ni yo, puede verla).

Cuando haces el onboarding: tus respuestas se usan para crear tu perfil. Guardo tu nombre, tu edad, tus metas, lo que valoras, el área de tu vida en la que quieres enfocarte, el tono que prefieres, la hora a la que quieres recibir tu mensaje y tu zona horaria.

También guardo tres textos que la inteligencia artificial escribe a partir de esa conversación: cómo está tu energía hoy, qué patrón te detiene y quién quieres llegar a ser. Estos textos pueden incluir cosas muy personales, como tu historia familiar o tus miedos, porque salen de lo que me contaste.

La conversación completa del onboarding se borra en cuanto lo terminas. Solo se queda el resumen de arriba. Si lo dejas a medias, la conversación se conserva hasta que lo termines o borres tu cuenta.

Mientras usas la app: guardo los mensajes diarios que recibes, tus tareas y si las marcaste, y tus insights diarios.

## Para qué lo uso:

Solo para una cosa: generar y enviarte tu mensaje diario con tus tareas, y mostrarte tu progreso. No vendo tus datos, no los comparto con anunciantes y no los uso para nada más.

## Quién más ve tus datos:

Para que la app funcione uso estos servicios:

- Supabase guarda tu cuenta y toda tu información.
- Anthropic (Claude) recibe tu conversación del onboarding, tu perfil y tus metas para escribir tus textos personales, tus mensajes, tareas e insights.
- Resend recibe tu correo electrónico y el texto de tus mensajes para enviártelos.
- Vercel aloja la app.

Cada uno tiene su propia política de privacidad. Tu contraseña solo la maneja Supabase, que la guarda cifrada.

## Qué no hago:

No uso herramientas de analítica ni de seguimiento. No hay cookies de publicidad. Las únicas cookies que uso son las necesarias para mantener tu sesión abierta.

## Tus datos:

Puedes cambiar casi toda tu información desde tu perfil: tu nombre, tus edades, tus metas, tu enfoque, el tono y la hora de envío. Tu zona horaria y los tres textos que escribió la inteligencia artificial todavía no se pueden editar ahí; si quieres cambiarlos, escríbeme.

Puedes borrar tu cuenta desde tu perfil. Al hacerlo se borra todo lo tuyo de mi base de datos: tu perfil, tus metas, tus mensajes, tus tareas y tus insights. Es inmediato y no se puede deshacer.

Hay cosas que quedan fuera de mi alcance: los correos que ya te envié siguen en tu bandeja, y los servicios que mencioné arriba conservan sus propios registros por el tiempo que indiquen sus políticas.

## Contacto:

Si tienes dudas sobre tus datos, escríbeme a contacto@villegasvrodrigo.com.`;
