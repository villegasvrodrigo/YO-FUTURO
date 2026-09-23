// /privacidad is public: the privacy notice must be readable before creating an account.
const PUBLIC_ROUTES = new Set(['/', '/login', '/signup', '/auth/confirm', '/login/recuperar', '/privacidad']);

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  if (pathname.startsWith('/api/cron')) return true;
  return false;
}

/**
 * Whether a signed-in visit to `pathname` should be checked against
 * `profiles.onboarding_completed` and bounced to /onboarding if it isn't done.
 * Excludes public routes, onboarding itself (and its subroutes, to avoid a
 * redirect loop), and every /api/ route — API handlers return JSON/errors of
 * their own and must never receive an HTML redirect (the cron endpoint in
 * particular has no signed-in user at all).
 */
export function requiresCompletedOnboarding(pathname: string): boolean {
  if (pathname.startsWith('/api/')) return false;
  if (isPublicRoute(pathname)) return false;
  if (pathname === '/onboarding' || pathname.startsWith('/onboarding/')) return false;
  // A mitad de un flujo de recuperación de contraseña: ya hay sesión (la dejó
  // verifyOtp), pero forzar el onboarding aquí interrumpiría fijar la
  // contraseña nueva antes de mandar al usuario a cualquier otro lado.
  if (pathname === '/auth/nueva-password') return false;
  return true;
}
