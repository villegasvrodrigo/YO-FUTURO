// The text of the privacy notice, kept apart from the page so it can be edited without
// touching the layout. Format, one block per blank-line-separated chunk:
// - a block starting with "## " is a section title;
// - a block whose lines all start with "- " is a bulleted list;
// - anything else is a paragraph (its line breaks are joined with spaces).
// Email addresses become links automatically.

// The notice's own first title; the page shows it as its main heading.
export const PRIVACY_TITLE = 'Aviso de privacidad';

export const PRIVACY_TEXT = `Última actualización: 24 de septiembre de 2026

Yo Futuro es un proyecto personal en fase de prueba. Este aviso explica en palabras simples qué datos guardo, para qué, y cómo puedes borrarlos.

## Qué guardo:

Cuando creas tu cuenta: tu correo electrónico y tu contraseña (cifrada; nadie, ni yo, puede verla).

Cuando haces el onboarding: tus respuestas se usan para crear tu perfil. Guardo tu nombre, tu edad, tus metas, lo que valoras, el área de tu vida en la que quieres enfocarte, el tono que prefieres, la hora a la que quieres recibir tu mensaje y tu zona horaria.

También guardo tres textos que la inteligencia artificial escribe a partir de esa conversación: cómo está tu energía hoy, qué patrón te detiene y quién quieres llegar a ser. Estos textos pueden incluir cosas muy personales, como tu historia familiar o tus miedos, porque salen de lo que me contaste.

La conversación completa del onboarding se borra en cuanto lo terminas. Solo se queda el resumen de arriba. Si lo dejas a medias, la conversación se conserva hasta que lo termines o borres tu cuenta.

Mientras usas la app: guardo los mensajes diarios que recibes, tus tareas y si las marcaste, y tus insights diarios.

Cuando usas el chat con tu yo futuro: guardo tus mensajes y las respuestas de tu yo futuro. También guardo un resumen corto de cada conversación, que escribe la inteligencia artificial, para que la próxima vez tu yo futuro recuerde lo importante. Las conversaciones y sus resúmenes se conservan mientras tengas tu cuenta.

Si un mensaje tuyo parece una situación de crisis (por ejemplo, que quieres hacerte daño, que no quieres vivir o que alguien te está haciendo daño), la app lo marca para responderte con números de ayuda. Ese mensaje se guarda como el resto de la conversación, con esa marca. El resumen de esa conversación no guarda ningún detalle de la crisis: solo anota que fue un momento difícil, para que tu yo futuro te pregunte con cuidado cómo estás.

## Para qué lo uso:

Solo para esto: generar y enviarte tu mensaje diario con tus tareas, mostrarte tu progreso y conversar contigo en el chat. No vendo tus datos, no los comparto con anunciantes y no los uso para nada más.

## Sobre el chat:

El chat es una herramienta para acompañarte con tus metas y tus tareas. No es un servicio de emergencias y no sustituye a un psicólogo, a un médico ni a ningún otro profesional.

Nadie está leyendo tus mensajes, y nadie recibe un aviso si escribes algo que preocupa: ni yo ni ninguna otra persona. Si estás en peligro, llama al 911 o a la Línea de la Vida al 800 911 2000, gratis y a cualquier hora.

## Quién más ve tus datos:

Para que la app funcione uso estos servicios:

- Supabase guarda tu cuenta y toda tu información.
- Anthropic (Claude) recibe tu conversación del onboarding, tu perfil, tus metas y tus conversaciones del chat para escribir tus textos personales, tus mensajes, tareas e insights, las respuestas de tu yo futuro y los resúmenes de tus conversaciones.
- Resend recibe tu correo electrónico y el texto de tus mensajes para enviártelos.
- Vercel aloja la app.

Cada uno tiene su propia política de privacidad. Tu contraseña solo la maneja Supabase, que la guarda cifrada.

Tu información no está cifrada de forma que solo tú puedas leerla. Como responsable de la app, tengo acceso técnico a la base de datos donde se guarda, incluidas tus conversaciones del chat. No la reviso; solo entraría si hiciera falta para arreglar un problema técnico, y veré lo mínimo necesario.

## Qué no hago:

No uso herramientas de analítica ni de seguimiento. No hay cookies de publicidad. Las únicas cookies que uso son las necesarias para mantener tu sesión abierta.

## Tus datos:

Puedes cambiar casi toda tu información desde tu perfil: tu nombre, tus edades, tus metas, tu enfoque, el tono y la hora de envío. Tu zona horaria y los tres textos que escribió la inteligencia artificial todavía no se pueden editar ahí; si quieres cambiarlos, escríbeme.

Puedes borrar tu cuenta desde tu perfil. Al hacerlo se borra todo lo tuyo de mi base de datos: tu perfil, tus metas, tus mensajes, tus tareas, tus insights, y tus conversaciones del chat con sus resúmenes. Es inmediato y no se puede deshacer.

Por ahora no puedes borrar una conversación del chat por separado desde la app. Si quieres que borre alguna, escríbeme.

Hay cosas que quedan fuera de mi alcance: los correos que ya te envié siguen en tu bandeja, y los servicios que mencioné arriba conservan sus propios registros por el tiempo que indiquen sus políticas.

## Contacto:

Si tienes dudas sobre tus datos, escríbeme a contacto@villegasvrodrigo.com.`;
