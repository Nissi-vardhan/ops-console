'use client';

import { useEffect } from 'react';

// Registers the service worker (public/sw.js) so the console is installable as an
// app. Renders nothing. Safe to include once in the root layout.
export function PwaRegister() {
   useEffect(() => {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
      const register = () => {
         navigator.serviceWorker.register('/sw.js').catch(() => {
            // registration failing just means no install prompt — never breaks the app.
         });
      };
      if (document.readyState === 'complete') register();
      else {
         window.addEventListener('load', register);
         return () => window.removeEventListener('load', register);
      }
   }, []);
   return null;
}
