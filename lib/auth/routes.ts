const PUBLIC_ROUTES = new Set(['/', '/login', '/signup']);

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  if (pathname.startsWith('/api/cron')) return true;
  return false;
}
