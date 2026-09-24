// Crisis protocol, enforced by the server so it never depends on the model remembering it:
// every crisis reply ends up with the Línea de la Vida and 911, and a few unmistakable phrases
// turn a message into a crisis even when the model didn't flag it.

// Added at the end of a crisis reply that lacks either number.
export const CRISIS_RESOURCES_TEXT =
  'Si estás pasando por un momento muy difícil, no tienes que vivirlo a solas. Puedes llamar gratis a la Línea de la Vida al 800 911 2000, a cualquier hora. Si estás en peligro ahora mismo, llama al 911. Y si puedes, busca hoy a alguien de confianza y cuéntale cómo estás.';

// Used instead of the model's reply when the person's message has a crisis phrase but the
// model answered as usual (its reply would have gone on with tasks or goals).
export const CRISIS_FALLBACK_REPLY = `Gracias por contármelo. Lo que sientes importa. Ahora mismo lo más importante eres tú, no las tareas ni las metas.

${CRISIS_RESOURCES_TEXT}`;

// Phrases that always mean a crisis, compared without accents or capitals. Only phrases that
// are unmistakable on their own: ambiguous words ("matar", "cortarme", "me pega") have common
// everyday meanings and are left to the model.
export const CRISIS_PHRASES = [
  'suicid',
  'quitarme la vida',
  'quiero matarme',
  'voy a matarme',
  'pienso en matarme',
  'ganas de matarme',
  'no quiero vivir',
  'no quiero seguir viviendo',
  'quiero morir',
  'me quiero matar',
  'me voy a matar',
  'me quiero quitar la vida',
  'me quiero hacer dano',
  'no quiero estar aqui',
  'estarian mejor sin mi',
  'no quiero despertar',
  'ganas de morir',
  'hacerme dano',
  'autolesion',
  'me golpea',
  'me maltrata',
  'abusa de mi',
  'abuso de mi',
] as const;

/** Lowercase, without accents, so "Suicidio" and "suicidio" and "daño"/"dano" all match. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Whether the person's message contains one of the unmistakable crisis phrases. */
export function hasCrisisPhrase(message: string): boolean {
  const text = normalize(message);
  return CRISIS_PHRASES.some((phrase) => text.includes(phrase));
}

const LINEA_DE_LA_VIDA = /800[\s.-]*911[\s.-]*2000/;

/** Whether the reply gives both the Línea de la Vida (800 911 2000) and 911 on its own. */
export function hasCrisisResources(reply: string): boolean {
  if (!LINEA_DE_LA_VIDA.test(reply)) return false;
  // 911 inside "800 911 2000" doesn't count: it must also appear as its own number.
  return /(^|\D)911(\D|$)/.test(reply.replace(new RegExp(LINEA_DE_LA_VIDA, 'g'), ' '));
}

/** The reply with CRISIS_RESOURCES_TEXT appended, unless it already gives both numbers. */
export function withCrisisResources(reply: string): string {
  return hasCrisisResources(reply) ? reply : `${reply.trimEnd()}\n\n${CRISIS_RESOURCES_TEXT}`;
}

export interface CrisisDecision {
  isCrisis: boolean;
  reply: string;
}

/**
 * The final reply and whether it is a crisis, from the person's message, the model's reply
 * and the model's own crisis flag:
 * - the model flagged a crisis: its reply, with the numbers added if it left any out;
 * - it didn't, but the message has an unmistakable crisis phrase: CRISIS_FALLBACK_REPLY;
 * - otherwise: the model's reply, untouched.
 */
export function applyCrisisProtocol(userMessage: string, modelReply: string, modelSaysCrisis: boolean): CrisisDecision {
  if (modelSaysCrisis) return { isCrisis: true, reply: withCrisisResources(modelReply) };
  if (hasCrisisPhrase(userMessage)) return { isCrisis: true, reply: CRISIS_FALLBACK_REPLY };
  return { isCrisis: false, reply: modelReply };
}
