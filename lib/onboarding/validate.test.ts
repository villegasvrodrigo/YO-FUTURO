import { describe, it, expect } from 'vitest';
import { validateProfileStep, validateGoals, validateDeliveryHour } from './validate';

describe('validateProfileStep', () => {
  const base = {
    name: 'Ana',
    currentAge: 25,
    futureSelfAge: 40,
    focusArea: 'carrera' as const,
    tone: 'motivador' as const,
    values: 'la honestidad',
  };

  it('accepts valid input', () => {
    expect(validateProfileStep(base)).toBeNull();
  });

  it('rejects an empty name', () => {
    expect(validateProfileStep({ ...base, name: '  ' })).toBe('El nombre es obligatorio');
  });

  it('rejects an out-of-range current age', () => {
    expect(validateProfileStep({ ...base, currentAge: 5 })).toBe(
      'La edad actual debe ser un número entre 13 y 120'
    );
  });

  it('rejects a future age that is not greater than the current age', () => {
    expect(validateProfileStep({ ...base, futureSelfAge: 25 })).toBe(
      'La edad futura debe ser mayor que tu edad actual'
    );
  });
});

describe('validateGoals', () => {
  it('rejects an empty goals list', () => {
    expect(validateGoals([])).toBe('Agrega al menos una meta');
  });

  it('rejects a list of only blank strings', () => {
    expect(validateGoals(['  ', ''])).toBe('Agrega al menos una meta');
  });

  it('accepts at least one non-empty goal', () => {
    expect(validateGoals(['Lanzar mi startup'])).toBeNull();
  });
});

describe('validateDeliveryHour', () => {
  it('accepts hours between 0 and 23', () => {
    expect(validateDeliveryHour(8)).toBeNull();
  });

  it('rejects negative hours', () => {
    expect(validateDeliveryHour(-1)).toBe('La hora debe estar entre 0 y 23');
  });

  it('rejects hours above 23', () => {
    expect(validateDeliveryHour(24)).toBe('La hora debe estar entre 0 y 23');
  });
});
