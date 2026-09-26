/**
 * One step of the onboarding conversation. Questions and the encouragement are said word for
 * word (see buildSystemPrompt in chat.ts); the first step is only an instruction for the guide.
 * - 'note': an instruction, never said as such.
 * - 'question': asked exactly as written, one per message.
 * - 'encouragement': said exactly as written, in the same message as the next question.
 */
export interface OnboardingScriptStep {
  kind: 'note' | 'question' | 'encouragement';
  text: string;
}

export const ONBOARDING_GREETING =
  'Hola. Antes de escribirte tu primer mensaje, quiero conocerte un poco. Para empezar, ¿cómo te llamas?';

// Where each answer goes afterwards: the name, ages and area go to the profile; 14 gives the
// goals and 15 the values (lib/onboarding/extract-profile.ts); 6, 8, 9, 12, 14 and 15 feed the
// radiografía (lib/onboarding/synthesis.ts); the whole conversation sets the tone.
export const ONBOARDING_SCRIPT: OnboardingScriptStep[] = [
  {
    kind: 'note',
    text: `La conversación ya abrió con este saludo tuyo, que la persona ya leyó: "${ONBOARDING_GREETING}" — usa su respuesta con el nombre, no lo preguntes de nuevo, y no repitas frases como "quiero conocerte un poco" ya que eso ya se dijo ahí.`,
  },
  { kind: 'question', text: '¿Cuántos años tienes?' },
  {
    kind: 'question',
    text: 'Tu yo futuro te va a escribir desde más adelante en tu vida. ¿Desde qué edad quieres que te hable? Por ejemplo, desde los 45.',
  },
  {
    kind: 'question',
    text: '¿Qué área de tu vida quieres trabajar más ahora: Dinero y abundancia, Amor y relaciones, Paz, o Tu cuerpo?',
  },
  { kind: 'question', text: 'Del área que elegiste, ¿qué es lo que más te gustaría cambiar?' },
  {
    kind: 'question',
    text: 'Piensa en un recuerdo de cuando eras más joven, relacionado con esto, que te haya dolido o marcado. ¿Qué pasó y cómo lo viviste?',
  },
  {
    kind: 'question',
    text: 'Mientras crecías, ¿a quién admirabas más o de quién buscabas su aprobación o amor?',
  },
  {
    kind: 'question',
    text: 'Hoy, en tu día a día, ¿cómo es tu relación con esto que quieres cambiar? Cuéntamelo con toda honestidad.',
  },
  {
    kind: 'question',
    text: 'Cuando piensas en esto o te toca enfrentarlo, ¿qué sientes en el cuerpo y qué emociones aparecen?',
  },
  {
    kind: 'question',
    text: 'Piensa en alguna vez cuando las cosas iban bien. ¿Cómo te sentías y qué hacías diferente?',
  },
  { kind: 'encouragement', text: 'Vas muy bien, ya vamos a la mitad.' },
  {
    kind: 'question',
    text: 'En cualquier momento de tu vida, ¿cuál ha sido la situación más difícil o dolorosa relacionada con esto que quieres cambiar? Cuéntamelo con el mayor detalle posible, es importante.',
  },
  { kind: 'question', text: 'Cuando las cosas no salen como esperas, ¿qué sueles hacer?' },
  {
    kind: 'question',
    text: 'Imagina que todo sale bien. ¿Cómo te gustaría estar dentro de un año? Y si quieres, cuéntame también tu visión a largo plazo.',
  },
  {
    kind: 'question',
    text: 'Imagina que ya estás viviendo tu realidad deseada. ¿Cómo es? ¿Cómo piensas, cómo actúas, cómo te sientes?',
  },
  {
    kind: 'question',
    text: '¿Te comprometes a ser esa versión de ti, aunque a veces no sea fácil y tengas que incomodarte, y a dejar de regresar a los patrones que te han estado frenando?',
  },
];
