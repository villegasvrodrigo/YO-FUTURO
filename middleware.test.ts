import { describe, it, expect } from 'vitest';
import { config } from './middleware';

// The matcher is a single path pattern; anchored, it tells which paths the middleware runs on.
const runsOn = (pathname: string) => new RegExp(`^${config.matcher[0]}$`).test(pathname);

describe('middleware matcher', () => {
  it.each(['/api/cron/send-messages', '/api/onboarding/chat', '/api/account/delete', '/api/chat'])(
    'leaves %s out (API routes check the session themselves)',
    (pathname) => {
      expect(runsOn(pathname)).toBe(false);
    }
  );

  it.each(['/', '/login', '/dashboard', '/progreso', '/perfil', '/onboarding', '/apicultura'])(
    'still runs on the page %s',
    (pathname) => {
      expect(runsOn(pathname)).toBe(true);
    }
  );

  it.each(['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-maskable-512.png', '/icon.png', '/apple-icon.png'])(
    'leaves %s out, so the phone can install the app with or without a session',
    (pathname) => {
      expect(runsOn(pathname)).toBe(false);
    }
  );

  it('leaves static files out, as before', () => {
    expect(runsOn('/_next/static/chunk.js')).toBe(false);
    expect(runsOn('/favicon.ico')).toBe(false);
  });
});
