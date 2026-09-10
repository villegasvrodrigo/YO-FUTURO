import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { runOnboardingTurn } from '@/lib/onboarding/chat';

const RequestBodySchema = z.object({
  transcript: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(2000),
      })
    )
    .min(1)
    .max(40),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  let transcript;
  try {
    const parsed = RequestBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
    }
    transcript = parsed.data.transcript;
  } catch {
    // Malformed JSON body.
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }

  try {
    const result = await runOnboardingTurn(transcript);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[onboarding-chat]', err);
    return NextResponse.json(
      { error: 'No se pudo continuar la conversación, intenta de nuevo.' },
      { status: 500 }
    );
  }
}
