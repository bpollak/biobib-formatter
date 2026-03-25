import type { Metadata } from 'next';
import ThemeRegistry from './ThemeRegistry';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dissertation Formatting Agent — UC San Diego GEPA',
  description: 'Check and auto-correct dissertation formatting requirements for UC San Diego Graduate Division (GEPA).',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
