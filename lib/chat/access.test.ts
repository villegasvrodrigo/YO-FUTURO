import { describe, it, expect } from 'vitest';
import { isChatEnabledFor } from './access';

describe('isChatEnabledFor', () => {
  it("is on only for the owner's account while the chat is being built", () => {
    expect(isChatEnabledFor('39fc48c8-e574-43a4-a192-b0ce420686d2')).toBe(true);
  });

  it('is off for any other account, or no account', () => {
    expect(isChatEnabledFor('0a2a2da9-9330-4154-96fa-5be6c82da257')).toBe(false);
    expect(isChatEnabledFor('')).toBe(false);
    expect(isChatEnabledFor(null)).toBe(false);
    expect(isChatEnabledFor(undefined)).toBe(false);
  });
});
