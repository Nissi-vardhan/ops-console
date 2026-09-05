import type { MetadataRoute } from 'next';

// PWA manifest — makes ops.shortcastle.com installable as a standalone app
// (Add to Home Screen on mobile, install prompt on desktop Chrome/Edge).
export default function manifest(): MetadataRoute.Manifest {
   return {
      name: 'Shortcastle Ops',
      short_name: 'Ops',
      description:
         'Shortcastle internal ops console — issues, projects, cadences, docs, infra and cross-session knowledge recall.',
      start_url: '/',
      display: 'standalone',
      background_color: '#0a0a0a',
      theme_color: '#0a0a0a',
      orientation: 'portrait-primary',
      icons: [
         { src: '/images/icon-192.png', sizes: '192x192', type: 'image/png' },
         { src: '/images/icon-512.png', sizes: '512x512', type: 'image/png' },
         {
            src: '/images/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
         },
      ],
   };
}
