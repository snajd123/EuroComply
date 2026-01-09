import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'EuroComply - Digital Product Passport Platform',
  description: 'EU compliance made simple. Digital Product Passports, eIDAS 2.0 credentials, and DSA compliance for e-commerce.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
