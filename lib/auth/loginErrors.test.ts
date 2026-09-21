import { describe, it, expect } from 'vitest';
import { translateLoginError } from './loginErrors';

describe('translateLoginError', () => {
  it('translates invalid credentials', () => {
    expect(translateLoginError('Invalid login credentials')).toBe('Correo o contraseña incorrectos.');
  });

  it('translates an unconfirmed email', () => {
    expect(translateLoginError('Email not confirmed')).toBe(
      'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada (o la carpeta de spam).'
    );
  });

  it('falls back to a generic Spanish message for an unmapped error', () => {
    expect(translateLoginError('Some unexpected Supabase error')).toBe(
      'No se pudo iniciar sesión. Intenta de nuevo.'
    );
  });
});
