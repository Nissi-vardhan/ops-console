'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeStore } from '@/store/theme-store';
import { useTheme } from 'next-themes';

/**
 * One-click light/dark switch for the header. Flips the theme-store mode
 * between light and dark based on what's currently resolved (so it does the
 * expected thing under `system` too). Variant selection (Pure Light, Magic
 * Blue, Classic Dark) still lives in the sidebar menu and Preferences.
 */
export function ThemeToggleButton() {
   const { setMode } = useThemeStore();
   const { resolvedTheme } = useTheme();

   // The store is persisted in localStorage — wait for mount to avoid a
   // hydration mismatch on the icon.
   const [mounted, setMounted] = React.useState(false);
   React.useEffect(() => setMounted(true), []);
   if (!mounted) {
      return <div className="h-8 w-8 shrink-0" aria-hidden />;
   }

   const isDark = resolvedTheme === 'dark';
   return (
      <Button
         variant="ghost"
         size="icon"
         className="h-8 w-8"
         onClick={() => setMode(isDark ? 'light' : 'dark')}
         aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
         title={isDark ? 'Light theme' : 'Dark theme'}
      >
         {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
   );
}
