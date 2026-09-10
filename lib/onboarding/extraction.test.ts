import { describe, it, expect } from 'vitest';
import { mergeExtracted, EMPTY_EXTRACTED_PROFILE, type ExtractedProfile } from './extraction';

describe('mergeExtracted', () => {
  it('fills in previously-unknown fields from the new extraction', () => {
    const prev = EMPTY_EXTRACTED_PROFILE;
    const next: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, name: 'Ana', currentAge: 25 };
    const merged = mergeExtracted(prev, next);
    expect(merged.name).toBe('Ana');
    expect(merged.currentAge).toBe(25);
  });

  it('keeps previously-known fields when the new extraction has null for them', () => {
    const prev: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, name: 'Ana' };
    const next: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, name: null, currentAge: 25 };
    const merged = mergeExtracted(prev, next);
    expect(merged.name).toBe('Ana');
    expect(merged.currentAge).toBe(25);
  });

  it('overwrites a previously-known field when the new extraction has a different non-null value', () => {
    const prev: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, deliveryHour: 8 };
    const next: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, deliveryHour: 20 };
    const merged = mergeExtracted(prev, next);
    expect(merged.deliveryHour).toBe(20);
  });

  it('keeps a previously-known string field when the new extraction has an empty string', () => {
    const prev: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, values: 'la honestidad' };
    const next: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, values: '' };
    const merged = mergeExtracted(prev, next);
    expect(merged.values).toBe('la honestidad');
  });

  it('keeps previously-known goals when the new extraction has an empty array', () => {
    const prev: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, goals: ['Meta 1'] };
    const next: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, goals: [] };
    const merged = mergeExtracted(prev, next);
    expect(merged.goals).toEqual(['Meta 1']);
  });

  it('merges the goals array as a whole when present in the new extraction', () => {
    const prev: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, goals: ['Meta 1'] };
    const next: ExtractedProfile = { ...EMPTY_EXTRACTED_PROFILE, goals: ['Meta 1', 'Meta 2'] };
    const merged = mergeExtracted(prev, next);
    expect(merged.goals).toEqual(['Meta 1', 'Meta 2']);
  });

  it('merges newly-extracted narrative fields the same way as any other field', () => {
    const prev = EMPTY_EXTRACTED_PROFILE;
    const next: ExtractedProfile = {
      ...EMPTY_EXTRACTED_PROFILE,
      blockingPattern: 'Evita hablar de dinero cuando se siente ansioso.',
    };
    const merged = mergeExtracted(prev, next);
    expect(merged.blockingPattern).toBe('Evita hablar de dinero cuando se siente ansioso.');
  });
});
