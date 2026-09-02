'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, HelpCircle } from 'lucide-react';

export interface ConfirmOpts {
   title?: string;
   message?: ReactNode;
   confirmText?: string;
   cancelText?: string;
   danger?: boolean;
}

const ConfirmCtx = createContext<((o?: ConfirmOpts) => Promise<boolean>) | null>(null);

/**
 * App-wide, promise-based confirm dialog — a themed, animated replacement for the
 * native `window.confirm()`. `const confirm = useConfirm(); if (await confirm({…}))`.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
   const [open, setOpen] = useState(false);
   const [opts, setOpts] = useState<ConfirmOpts>({});
   const resolver = useRef<((v: boolean) => void) | null>(null);

   const confirm = useCallback(
      (o: ConfirmOpts = {}) =>
         new Promise<boolean>((resolve) => {
            setOpts(o);
            setOpen(true);
            resolver.current = resolve;
         }),
      []
   );

   const settle = (v: boolean) => {
      setOpen(false);
      const r = resolver.current;
      resolver.current = null;
      r?.(v);
   };

   const danger = !!opts.danger;

   return (
      <ConfirmCtx.Provider value={confirm}>
         {children}
         <Dialog
            open={open}
            onOpenChange={(o) => {
               if (!o) settle(false);
            }}
         >
            <DialogContent className="sm:max-w-sm">
               <div className="flex items-start gap-3">
                  <span
                     className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${
                        danger ? 'bg-destructive/12 text-destructive' : 'bg-primary/12 text-primary'
                     }`}
                  >
                     {danger ? (
                        <AlertTriangle className="size-4" />
                     ) : (
                        <HelpCircle className="size-4" />
                     )}
                  </span>
                  <div className="min-w-0 pt-0.5">
                     <DialogTitle>{opts.title ?? 'Are you sure?'}</DialogTitle>
                     {opts.message != null && (
                        <DialogDescription className="mt-1">{opts.message}</DialogDescription>
                     )}
                  </div>
               </div>
               <div className="mt-5 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => settle(false)}>
                     {opts.cancelText ?? 'Cancel'}
                  </Button>
                  <Button
                     size="sm"
                     variant={danger ? 'destructive' : 'default'}
                     onClick={() => settle(true)}
                     autoFocus
                  >
                     {opts.confirmText ?? 'Confirm'}
                  </Button>
               </div>
            </DialogContent>
         </Dialog>
      </ConfirmCtx.Provider>
   );
}

export function useConfirm() {
   const c = useContext(ConfirmCtx);
   if (!c) throw new Error('useConfirm must be used within ConfirmProvider');
   return c;
}
