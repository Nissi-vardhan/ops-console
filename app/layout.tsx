import type { Metadata } from 'next';
import { headers } from 'next/headers';
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

const opsMetadata: Metadata = {
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
   manifest: '/manifest.webmanifest',
   appleWebApp: {
      capable: true,
      title: 'Ops',
      statusBarStyle: 'black-translucent',
   },
   icons: {
      apple: '/images/icon-192.png',
   },
};

const TASKS_ICON =
   "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='4' fill='%232563eb'/%3E%3Cpath d='M4 8.5l2.5 2.5L12 5.5' stroke='white' stroke-width='2' fill='none'/%3E%3C/svg%3E";

// On the intern host (SC-430) the app is "TrainerDB Tasks": no company name, no app manifest.
const internMetadata: Metadata = {
   title: { template: '%s | TrainerDB Tasks', default: 'TrainerDB Tasks' },
   robots: { index: false, follow: false },
   icons: { icon: TASKS_ICON },
};

async function onInternHost(): Promise<boolean> {
   const host = ((await headers()).get('host') || '').split(':')[0].toLowerCase();
   const internHost = (process.env.INTERN_API_HOST || '').toLowerCase();
   return !!internHost && host === internHost;
}

export async function generateMetadata(): Promise<Metadata> {
   return (await onInternHost()) ? internMetadata : opsMetadata;
}

export const viewport = {
   themeColor: '#eef2f8',
};

import { ThemeProvider } from '@/components/layout/theme-provider';
import { ConfirmProvider } from '@/components/common/confirm';
import { PwaRegister } from '@/components/pwa-register';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { InternModeProvider } from '@/components/intern-mode';

export default async function RootLayout({
   children,
}: Readonly<{
   children: React.ReactNode;
}>) {
   const intern = await onInternHost();
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
               <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
                  <InternModeProvider value={intern}>
                     <ConfirmProvider>{children}</ConfirmProvider>
                  </InternModeProvider>
                  <Toaster />
                  {!intern && <PwaRegister />}
               </ThemeProvider>
            </NuqsAdapter>
         </body>
      </html>
   );
}
