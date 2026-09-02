import type { Metadata } from 'next';
import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

// Body: Hanken Grotesk — a warm grotesque, legible in dense tables.
// Mono: JetBrains Mono — the OPS-N task ids / dates read like notation.
// Variable names kept as --font-geist-* so the @theme mapping stays put.
const geistSans = Hanken_Grotesk({
   variable: '--font-geist-sans',
   subsets: ['latin'],
});

const geistMono = JetBrains_Mono({
   variable: '--font-geist-mono',
   subsets: ['latin'],
});

const siteUrl = 'https://ops.shortcastle.com';

export const metadata: Metadata = {
   title: {
      template: '%s | Shortcastle Ops',
      default: 'Shortcastle Ops',
   },
   description:
      'Shortcastle internal ops console — issues, projects, cadences, docs, infra and cross-session knowledge recall.',
   openGraph: {
      type: 'website',
      locale: 'en_US',
      url: siteUrl,
      siteName: 'Shortcastle Ops',
   },
   authors: [{ name: 'Shortcastle' }],
   keywords: ['shortcastle', 'ops', 'issues', 'runbooks'],
};

import { ThemeProvider } from '@/components/layout/theme-provider';
import { ConfirmProvider } from '@/components/common/confirm';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

export default function RootLayout({
   children,
}: Readonly<{
   children: React.ReactNode;
}>) {
   return (
      <html lang="en" suppressHydrationWarning>
         <head>
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
         </head>
         <body
            className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background`}
            suppressHydrationWarning
         >
            <NuqsAdapter>
               <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
                  <ConfirmProvider>{children}</ConfirmProvider>
                  <Toaster />
               </ThemeProvider>
            </NuqsAdapter>
         </body>
      </html>
   );
}
