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
