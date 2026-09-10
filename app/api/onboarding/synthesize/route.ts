import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runOnboardingSynthesis } from '@/lib/onboarding/synthesis';
import { TranscriptRequestSchema } from '@/lib/onboarding/extraction';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  let transcript;
  try {
    const parsed = TranscriptRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
    }
    transcript = parsed.data.transcript;
  } catch {
    // Malformed JSON body.
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }

  try {
    const result = await runOnboardingSynthesis(transcript);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[onboarding-synthesize]', err);
    return NextResponse.json(
      { error: 'No se pudieron generar tus resultados, intenta de nuevo.' },
      { status: 500 }
    );
  }
}
