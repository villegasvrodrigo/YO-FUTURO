import { describe, it, expect } from 'vitest';
import { isPublicRoute } from './routes';

describe('isPublicRoute', () => {
  it('treats the landing page as public', () => {
    expect(isPublicRoute('/')).toBe(true);
  });

  it('treats /login and /signup as public', () => {
    expect(isPublicRoute('/login')).toBe(true);
    expect(isPublicRoute('/signup')).toBe(true);
  });

  it('treats cron endpoints as public (protected by CRON_SECRET instead)', () => {
    expect(isPublicRoute('/api/cron/send-messages')).toBe(true);
  });

  it('treats dashboard, perfil, historial and onboarding as protected', () => {
    expect(isPublicRoute('/dashboard')).toBe(false);
    expect(isPublicRoute('/perfil')).toBe(false);
    expect(isPublicRoute('/historial')).toBe(false);
    expect(isPublicRoute('/onboarding')).toBe(false);
  });
});
