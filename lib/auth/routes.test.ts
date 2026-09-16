import { describe, it, expect } from 'vitest';
import { isPublicRoute, requiresCompletedOnboarding } from './routes';

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

  it('treats the email confirmation callback as public (no session exists yet)', () => {
    expect(isPublicRoute('/auth/confirm')).toBe(true);
  });

  it('treats dashboard, perfil, historial and onboarding as protected', () => {
    expect(isPublicRoute('/dashboard')).toBe(false);
    expect(isPublicRoute('/perfil')).toBe(false);
    expect(isPublicRoute('/historial')).toBe(false);
    expect(isPublicRoute('/onboarding')).toBe(false);
  });
});

describe('requiresCompletedOnboarding', () => {
  it('does not require it on public routes', () => {
    expect(requiresCompletedOnboarding('/')).toBe(false);
    expect(requiresCompletedOnboarding('/login')).toBe(false);
    expect(requiresCompletedOnboarding('/signup')).toBe(false);
  });

  it('does not require it on the onboarding page or its subroutes', () => {
    expect(requiresCompletedOnboarding('/onboarding')).toBe(false);
    expect(requiresCompletedOnboarding('/onboarding/paso-2')).toBe(false);
  });

  it('does not require it on any /api/ route, even protected ones', () => {
    expect(requiresCompletedOnboarding('/api/cron/send-messages')).toBe(false);
    expect(requiresCompletedOnboarding('/api/account/delete')).toBe(false);
    expect(requiresCompletedOnboarding('/api/onboarding/chat')).toBe(false);
  });

  it('requires it on protected app pages', () => {
    expect(requiresCompletedOnboarding('/dashboard')).toBe(true);
    expect(requiresCompletedOnboarding('/perfil')).toBe(true);
    expect(requiresCompletedOnboarding('/historial')).toBe(true);
  });
});
