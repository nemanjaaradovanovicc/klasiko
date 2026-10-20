import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Klasiko',
    short_name: 'Klasiko',
    description: 'Učenici, raspored, prisustvo i članarine na jednom mestu.',
    lang: 'sr-Latn',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F7F3FB',
    theme_color: '#5B2A86',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Prisustvo danas', url: '/prisustvo' },
      { name: 'Uplate', url: '/uplate' },
      { name: 'Učenici', url: '/ucenici' },
    ],
  };
}
