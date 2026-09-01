'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, Bell, Check, MessageSquare } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Item {
   id: string;
   kind: 'blocker' | 'comment' | 'workflow';
   title: string;
   detail?: string;
   at: string;
   href?: string;
}

const ICON = { blocker: AlertTriangle, comment: MessageSquare, workflow: AlertTriangle };
const TINT = { blocker: 'text-amber-500', comment: 'text-primary', workflow: 'text-red-500' };

function rel(iso: string): string {
   if (!iso) return '';
   const ms = Date.now() - new Date(iso).getTime();
   const m = Math.floor(ms / 60000);
   if (m < 1) return 'just now';
   if (m < 60) return `${m}m ago`;
   const h = Math.floor(m / 60);
   if (h < 24) return `${h}h ago`;
   const d = Math.floor(h / 24);
   return `${d}d ago`;
}

export function NotificationsBell() {
   const router = useRouter();
   const { orgId } = useParams<{ orgId: string }>();
   const [items, setItems] = useState<Item[]>([]);
   const [seen, setSeen] = useState(0);

   const load = useCallback(() => {
      fetch('/api/ops/notifications', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => {
            if (d?.items) setItems(d.items);
         })
         .catch(() => {});
   }, []);

   useEffect(() => {
      try {
         setSeen(Number(localStorage.getItem('ops_notif_seen') || 0));
      } catch {
         /* storage blocked */
      }
      load();
      const t = setInterval(load, 90_000);
      return () => clearInterval(t);
   }, [load]);

   const unread = useMemo(
      () => items.filter((i) => new Date(i.at).getTime() > seen).length,
      [items, seen]
   );

   const markRead = () => {
      const now = Date.now();
      setSeen(now);
      try {
         localStorage.setItem('ops_notif_seen', String(now));
      } catch {
         /* storage blocked */
      }
   };

   return (
      <Popover>
         <PopoverTrigger asChild>
            <button
               className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
               aria-label="Notifications"
            >
               <Bell className="size-4" />
               {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                     {unread > 9 ? '9+' : unread}
                  </span>
               )}
            </button>
         </PopoverTrigger>
         <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b px-3 py-2">
               <span className="text-sm font-semibold">Notifications</span>
               <button
                  onClick={markRead}
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
               >
                  <Check className="size-3.5" /> Mark all read
               </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
               {items.length === 0 && (
                  <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                     You’re all caught up.
                  </p>
               )}
               {items.map((it) => {
                  const I = ICON[it.kind];
                  const isUnread = new Date(it.at).getTime() > seen;
                  return (
                     <button
                        key={it.id}
                        onClick={() => {
                           if (it.href) router.push(`/${orgId}${it.href}`);
                        }}
                        className={`flex w-full items-start gap-2.5 border-b border-border/50 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/50 ${
                           it.href ? 'cursor-pointer' : 'cursor-default'
                        }`}
                     >
                        <I className={`mt-0.5 size-4 shrink-0 ${TINT[it.kind]}`} />
                        <span className="min-w-0 flex-1">
                           <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium">{it.title}</span>
                              {isUnread && (
                                 <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                              )}
                           </span>
                           {it.detail && (
                              <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                 {it.detail}
                              </span>
                           )}
                           <span className="mt-0.5 block text-[11px] text-muted-foreground/70">
                              {rel(it.at)}
                           </span>
                        </span>
                     </button>
                  );
               })}
            </div>
            <div className="border-t px-3 py-1.5 text-center text-[11px] text-muted-foreground">
               {unread} unread
            </div>
         </PopoverContent>
      </Popover>
   );
}
