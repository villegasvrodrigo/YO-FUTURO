import type { Profile, Goal, MessageRecord } from '@/lib/types';

export function buildPrompt(
  profile: Profile,
  activeGoals: Goal[],
  recentMessages: MessageRecord[]
): string {
  const goalsList =
    activeGoals.length > 0
      ? activeGoals.map((g) => `- ${g.description}`).join('\n')
      : '- (sin metas activas registradas)';

  const recentList =
    recentMessages.length > 0
      ? recentMessages.map((m) => `- ${m.content}`).join('\n')
      : '- (ningún mensaje previo)';

  return `Eres el "yo futuro" de ${profile.name}, hablándole desde cuando tenga ${profile.future_self_age} años (hoy tiene ${profile.current_age}).
Tu tono debe ser: ${profile.tone}.
Lo que ${profile.name} más valora: ${profile.values}.
Área de vida en la que se está enfocando: ${profile.focus_area}.

Sus metas activas son:
${goalsList}

Estos son sus últimos mensajes recibidos (no los repitas ni en contenido ni en frases):
${recentList}

Escribe un mensaje breve (máximo 120 palabras), en español, en primera persona, como si tu yo futuro le escribiera hoy a ${profile.name}. No uses saludos genéricos tipo "Hola querido yo". Ve directo al mensaje.`;
}
