import { describe, it, expect, vi } from 'vitest';

// The fonts load from Google at build time; here they are just names.
vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: 'geist' }),
  Geist_Mono: () => ({ variable: 'geist-mono' }),
  Instrument_Serif: () => ({ variable: 'instrument-serif' }),
}));

const { metadata, viewport } = await import('./layout');

describe('layout (installable app)', () => {
  it('on iPhone: opens full screen, "Yo Futuro" under the icon, black status bar', () => {
    expect(metadata.applicationName).toBe('Yo Futuro');
    expect(metadata.appleWebApp).toEqual({ capable: true, title: 'Yo Futuro', statusBarStyle: 'black' });
    expect(metadata.other).toEqual({ 'apple-mobile-web-app-capable': 'yes' });
  });

  it('fills the screen down to the home indicator, with the app background as the bar color', () => {
    expect(viewport).toMatchObject({ width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#12141c' });
  });
});
