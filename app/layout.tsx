import type { Metadata } from 'next';
import { Instrument_Serif, Hanken_Grotesk, DM_Mono } from 'next/font/google';
import './globals.css';

// Display — Instrument Serif 400 (headings, theme name, screen/modal titles)
const instrumentSerif = Instrument_Serif({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

// UI / body — Hanken Grotesk 400..800
const hankenGrotesk = Hanken_Grotesk({
  weight: ['400', '500', '600', '700', '800'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ui',
});

// Numeric / mono — DM Mono (timer, slider values, badges, metadata)
const dmMono = DM_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'color-gradle',
  description:
    'A daily photo-editing game. One unedited photo. Five minutes. Ten sliders. Submit your look to see how everyone, human and AI, edited the same shot.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${hankenGrotesk.variable} ${dmMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
