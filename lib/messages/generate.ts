import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt } from './prompt';
import type { Profile, Goal, MessageRecord } from '@/lib/types';

const MODEL = 'claude-sonnet-5';

export interface GeneratedMessage {
  content: string;
  modelUsed: string;
}

export async function generateMessage(
  profile: Profile,
  activeGoals: Goal[],
  recentMessages: MessageRecord[],
  client: Anthropic = new Anthropic()
): Promise<GeneratedMessage> {
  const prompt = buildPrompt(profile, activeGoals, recentMessages);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude no devolvió contenido de texto');
  }

  return { content: textBlock.text, modelUsed: MODEL };
}
