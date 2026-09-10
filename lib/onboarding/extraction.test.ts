import { describe, it, expect } from 'vitest';
import {
  mergeExtracted,
  EMPTY_EXTRACTED_PROFILE,
  toClaudeMessages,
  assertValidReplyText,
  TranscriptRequestSchema,
  type ExtractedProfile,
} from './extraction';

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

describe('toClaudeMessages', () => {
  it('drops leading assistant messages so the first message is always a user turn', () => {
    const result = toClaudeMessages([
      { role: 'assistant', content: 'Hola, soy tu guía.' },
      { role: 'user', content: 'Me llamo Ana' },
      { role: 'assistant', content: '¿Qué edad tienes?' },
    ]);
    expect(result).toEqual([
      { role: 'user', content: 'Me llamo Ana' },
      { role: 'assistant', content: '¿Qué edad tienes?' },
    ]);
  });

  it('returns an empty array when there is no user message', () => {
    expect(toClaudeMessages([{ role: 'assistant', content: 'Hola' }])).toEqual([]);
  });
});

describe('assertValidReplyText', () => {
  it('throws the given message for an empty string', () => {
    expect(() => assertValidReplyText('', 'falló')).toThrow('falló');
  });

  it('throws the given message for a whitespace-only string', () => {
    expect(() => assertValidReplyText('   \n ', 'falló')).toThrow('falló');
  });

  it('throws the given message when the text leaks raw JSON syntax', () => {
    expect(() => assertValidReplyText('hola extracted:{', 'falló')).toThrow('falló');
  });

  it('throws the given message when the text leaks an internal field name', () => {
    expect(() => assertValidReplyText('tu futureVision es clara', 'falló')).toThrow('falló');
  });

  it('does not throw for normal text', () => {
    expect(() => assertValidReplyText('¿Cómo te llamas?', 'falló')).not.toThrow();
  });
});

describe('TranscriptRequestSchema', () => {
  it('accepts a well-formed transcript', () => {
    const result = TranscriptRequestSchema.safeParse({
      transcript: [{ role: 'user', content: 'Hola' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty transcript', () => {
    const result = TranscriptRequestSchema.safeParse({ transcript: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid role', () => {
    const result = TranscriptRequestSchema.safeParse({
      transcript: [{ role: 'system', content: 'hola' }],
    });
    expect(result.success).toBe(false);
  });
});
