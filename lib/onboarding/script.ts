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
    instruction:
      'Descubre a qué edad quiere que le hable su yo futuro (debe ser mayor que su edad actual).',
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
