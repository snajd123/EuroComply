import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'EuroComply - Professional Digital Product Passport SaaS',
  description: 'EU compliance made simple. Digital Product Passports, eIDAS 2.0 credentials, and DSA compliance for e-commerce.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html className="light" lang="en">
      <head>
        <link href="https://fonts.googleapis.com" rel="preconnect" />
        <link crossOrigin="anonymous" href="https://fonts.gstatic.com" rel="preconnect" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&family=Inter:wght@300..800&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-background-light dark:bg-background-dark text-text-main dark:text-stone-100 antialiased selection:bg-accent selection:text-primary-dark">
        {children}
      </body>
    </html>
  );
}
