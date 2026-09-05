import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
   /* config options here */
   devIndicators: false,
   serverExternalPackages: ['pg'],
   async headers() {
      return [
         {
            source: '/:path*',
            headers: [
               { key: 'X-Frame-Options', value: 'DENY' },
               { key: 'X-Content-Type-Options', value: 'nosniff' },
               { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
               {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=15552000; includeSubDomains',
               },
            ],
         },
      ];
   },
};

export default nextConfig;
