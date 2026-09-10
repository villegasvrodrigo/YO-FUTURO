import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runOnboardingTurn } from '@/lib/onboarding/chat';
import type { ChatMessage } from '@/lib/onboarding/extraction';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { transcript } = (await request.json()) as { transcript: ChatMessage[] };

  try {
    const result = await runOnboardingTurn(transcript);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
