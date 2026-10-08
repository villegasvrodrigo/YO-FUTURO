import type { MetadataRoute } from 'next';

// Web manifest: added to the home screen, Yo Futuro opens as an app (no browser bar), on
// Inicio, with its icon and the app's colors. No service worker or notifications yet.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Yo Futuro',
    short_name: 'Yo Futuro',
    description: 'Cada día, tu yo futuro te escribe un mensaje.',
    lang: 'es-MX',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#12141c', // the app's background (--ink)
    theme_color: '#12141c',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // With room around the emblem, so Android can crop them to a circle without cutting it.
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
