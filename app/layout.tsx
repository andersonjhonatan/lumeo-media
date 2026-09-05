import type { Metadata } from 'next';
import './globals.css';
import './legal-options.css';

export const metadata: Metadata = {
  title: 'LUMEO — mídia, do seu jeito',
  description: 'Analise, organize e processe suas mídias em uma experiência rápida e elegante.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
