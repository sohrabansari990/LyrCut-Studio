import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Vazirmatn, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const vazirmatn = Vazirmatn({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-farsi',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LyrCut Studio — Full HD Multi-Language Lyric Video Editor',
  description:
    'Upload videos, images, and audio, sync Farsi, Roman, and English lyrics with the singer, and export Full HD 1080p landscape or portrait videos.',
  openGraph: {
    title: 'LyrCut Studio — Full HD Multi-Language Lyric Video Editor',
    description:
      'Upload videos, images, and audio, sync Farsi, Roman, and English lyrics with the singer, and export Full HD 1080p landscape or portrait videos.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LyrCut Studio — Full HD Multi-Language Lyric Video Editor',
    description:
      'Upload videos, images, and audio, sync Farsi, Roman, and English lyrics with the singer, and export Full HD 1080p landscape or portrait videos.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${vazirmatn.variable} ${jetbrainsMono.variable} dark`}
    >
      <body
        className="bg-[#0B0D11] text-zinc-100 font-sans antialiased selection:bg-amber-500/30 selection:text-amber-100"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
