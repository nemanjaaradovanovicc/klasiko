import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

const manrope = Manrope({ subsets: ['latin', 'latin-ext'], variable: '--font-manrope', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Klasiko', template: '%s | Klasiko' },
  description: 'Klasiko: učenici, grupe, raspored, prisustvo i članarine na jednom mestu.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#5B2A86',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sr-Latn" className={manrope.variable}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
