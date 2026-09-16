import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseConfirmParams } from '@/lib/auth/confirm';

const INVALID_LINK_MESSAGE = 'El enlace no es válido o ya expiró. Inicia sesión o regístrate de nuevo.';

// Destino del enlace de confirmación de correo de Supabase: usar un dominio
// propio en vez de que el link salga hacia *.supabase.co ayuda a que Gmail no
// lo mande a spam. `createClient` es el mismo cliente de servidor que ya usan
// las demás rutas del proyecto — sus cookies quedan en la respuesta, así que
// verifyOtp() deja la sesión ya guardada cuando el navegador sigue el redirect.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const params = parseConfirmParams(url.searchParams);

  if (!params) {
    return redirectToLogin(url);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: params.tokenHash,
    type: params.type,
  });

  if (error) {
    return redirectToLogin(url);
  }

  // El middleware ya manda al dashboard a quien tenga onboarding_completed en
  // true, así que mandar siempre a /onboarding sirve tanto para altas nuevas
  // como para quien confirme un cambio de correo ya con el onboarding hecho.
  return NextResponse.redirect(new URL('/onboarding', url));
}

function redirectToLogin(currentUrl: URL) {
  const loginUrl = new URL('/login', currentUrl);
  loginUrl.searchParams.set('error', INVALID_LINK_MESSAGE);
  return NextResponse.redirect(loginUrl);
}
