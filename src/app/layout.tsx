import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * O nome do sistema é provisório e passará a vir de `system_setting` quando o
 * banco existir (Fase 3). Ver docs/DESIGN_SYSTEM.md §11.
 */
export const metadata: Metadata = {
  title: 'Renovo Conecta',
  description: 'Sistema de gestão da Igreja Renovo Camaçari',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
