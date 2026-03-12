import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import './globals.css';

const dmSans = localFont({
  src: '../../public/fonts/dm-sans-latin.woff2',
  weight: '100 1000',
  variable: '--font-sans-family',
  display: 'swap',
});

const dmSerifDisplay = localFont({
  src: '../../public/fonts/dm-serif-display-latin.woff2',
  variable: '--font-display-family',
  weight: '400',
  display: 'swap',
});

const jetBrainsMono = localFont({
  src: '../../public/fonts/jetbrains-mono-latin.woff2',
  variable: '--font-mono-family',
  weight: '100 800',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://nextjs-vercel.vertz.dev'),
  title: 'Vertz — One command. Full stack. Running.',
  description:
    'Define your schema once. Database, API, and UI — everything is derived. Zero config.',
  openGraph: {
    title: 'Vertz — One command. Full stack. Running.',
    description:
      'Define your schema once. Database, API, and UI — everything is derived. Zero config.',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
    type: 'website',
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
    <html
      lang="en"
      data-theme="dark"
      className={`${dmSans.variable} ${dmSerifDisplay.variable} ${jetBrainsMono.variable}`}
    >
      <body>
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
