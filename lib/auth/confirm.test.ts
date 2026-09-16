import { describe, it, expect } from 'vitest';
import { parseConfirmParams } from './confirm';

describe('parseConfirmParams', () => {
  it('returns the token hash and type when both are present and type is valid', () => {
    const params = new URLSearchParams({ token_hash: 'abc123', type: 'signup' });

    expect(parseConfirmParams(params)).toEqual({ tokenHash: 'abc123', type: 'signup' });
  });

  it('returns null when token_hash is missing', () => {
    const params = new URLSearchParams({ type: 'signup' });

    expect(parseConfirmParams(params)).toBeNull();
  });

  it('returns null when type is missing', () => {
    const params = new URLSearchParams({ token_hash: 'abc123' });

    expect(parseConfirmParams(params)).toBeNull();
  });

  it('returns null when type is not a recognized email OTP type', () => {
    const params = new URLSearchParams({ token_hash: 'abc123', type: 'not-a-real-type' });

    expect(parseConfirmParams(params)).toBeNull();
  });

  it('accepts every known email OTP type', () => {
    for (const type of ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']) {
      const params = new URLSearchParams({ token_hash: 'abc123', type });
      expect(parseConfirmParams(params)).toEqual({ tokenHash: 'abc123', type });
    }
  });
});
