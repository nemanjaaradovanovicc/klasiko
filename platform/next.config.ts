import type { NextConfig } from 'next';

// Inline skripte Next-a nemaju nonce, stilovi su inline, font i slike su sa istog domena.
// Supabase se zove iz pregledača samo ako klijent postoji; dozvoljen je *.supabase.co.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "upgrade-insecure-requests",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Već posećene stranice se 30 s prikazuju odmah iz memorije; izmene ih osvežavaju.
    staleTimes: { dynamic: 30, static: 180 },
  },
  async headers() {
    return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
