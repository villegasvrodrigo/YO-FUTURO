import { describe, it, expect, afterEach, vi } from 'vitest';
import { isChatEnabledFor, isChatSwitchedOn } from './access';

const OWNER = '39fc48c8-e574-43a4-a192-b0ce420686d2';
const ANOTHER = '0a2a2da9-9330-4154-96fa-5be6c82da257';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isChatEnabledFor', () => {
  it('is on for every signed-in account when CHAT_ENABLED is not set', () => {
    vi.stubEnv('CHAT_ENABLED', undefined);

    expect(isChatEnabledFor(OWNER)).toBe(true);
    expect(isChatEnabledFor(ANOTHER)).toBe(true);
  });

  it('is off without an account', () => {
    expect(isChatEnabledFor('')).toBe(false);
    expect(isChatEnabledFor(null)).toBe(false);
    expect(isChatEnabledFor(undefined)).toBe(false);
  });

  it('CHAT_ENABLED="false" turns it off for everyone, the owner included', () => {
    for (const value of ['false', 'FALSE', ' false ']) {
      vi.stubEnv('CHAT_ENABLED', value);

      expect(isChatSwitchedOn()).toBe(false);
      expect(isChatEnabledFor(OWNER)).toBe(false);
      expect(isChatEnabledFor(ANOTHER)).toBe(false);
    }
  });

  it('any other value leaves it on', () => {
    for (const value of ['true', '', '0', 'no', 'si']) {
      vi.stubEnv('CHAT_ENABLED', value);

      expect(isChatEnabledFor(ANOTHER)).toBe(true);
    }
  });
});
