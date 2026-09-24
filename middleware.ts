import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isPublicRoute, requiresCompletedOnboarding } from '@/lib/auth/routes';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !isPublicRoute(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  if (user && requiresCompletedOnboarding(request.nextUrl.pathname)) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      // No bloquear al usuario por un problema al consultar el perfil —
      // solo dejarlo pasar y registrar el error para investigarlo.
      console.error('[middleware] no se pudo verificar el estado del onboarding:', error);
    } else if (!profile || !profile.onboarding_completed) {
      const onboardingUrl = request.nextUrl.clone();
      onboardingUrl.pathname = '/onboarding';
      return NextResponse.redirect(onboardingUrl);
    }
  }

  return response;
}

// /api/ routes are left out: each one checks the session (or the cron secret) itself and
// answers with JSON, so a missing session must never become an HTML redirect to /login.
export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico).*)'],
};
