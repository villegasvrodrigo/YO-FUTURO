import { describe, it, expect, vi } from 'vitest';
import { navigateTo } from './navigate';

describe('navigateTo', () => {
  it.each(['/dashboard', '/onboarding', '/login', '/cuenta-eliminada'])('loads %s as a full page', (path) => {
    const location = { assign: vi.fn() };

    navigateTo(path, location);

    expect(location.assign).toHaveBeenCalledTimes(1);
    expect(location.assign).toHaveBeenCalledWith(path);
  });
});
