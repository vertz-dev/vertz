import type { Metadata } from 'next';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vertz — One command. Full stack. Running.',
  description:
    'Define your schema once. Database, API, and UI — everything is derived. Zero config.',
  openGraph: {
    title: 'Vertz — One command. Full stack. Running.',
    description:
      'Define your schema once. Database, API, and UI — everything is derived. Zero config.',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
    type: 'website',
    url: 'https://nextjs.vertz.dev',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vertz — One command. Full stack. Running.',
    description:
      'Define your schema once. Database, API, and UI — everything is derived. Zero config.',
    images: ['/og.png'],
  },
  icons: {
    icon: '/logo.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="preload" href="/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/dm-serif-display-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/jetbrains-mono-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
