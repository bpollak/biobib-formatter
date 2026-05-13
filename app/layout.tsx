import type { Metadata } from 'next';
import ThemeRegistry from './ThemeRegistry';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import './globals.css';

export const metadata: Metadata = {
  title: 'BioBib Formatter — UC San Diego Academic Personnel',
  description: 'Convert your faculty CV to UCSD Academic Biography & Bibliography (BioBib) format automatically.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head />
      <body style={{ margin: 0, padding: 0, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <ThemeRegistry>
          <Header />
          <main style={{ flex: 1 }}>
            {children}
          </main>
          <Footer />
        </ThemeRegistry>
      </body>
    </html>
  );
}
