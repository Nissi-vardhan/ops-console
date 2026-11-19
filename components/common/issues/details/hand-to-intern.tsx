'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

// "Hand to intern" on the task page (TDB-281): anyone who can see the task (a member on his own
// task, or an owner/admin) can give it to an active intern of the same product. The intern then
// sees it in the intern app; the task stays assigned to the member too. Hidden when the product
// has no interns.
export function HandToIntern({ issueRef }: { issueRef: string }) {
   const [data, setData] = useState<{ current: string | null; interns: string[] } | null>(null);
   const [pick, setPick] = useState('');
   const [busy, setBusy] = useState(false);
   const url = `/api/ops/issues/${encodeURIComponent(issueRef)}/intern`;

   useEffect(() => {
      fetch(url)
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => {
            if (!d) return;
            setData(d);
            setPick(d.interns?.[0] ?? '');
         })
         .catch(() => {});
   }, [url]);

   if (!data || (!data.current && !data.interns.length)) return null;

   const assign = async () => {
      if (!pick) return;
      setBusy(true);
      const r = await fetch(url, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ intern: pick }),
      }).catch(() => null);
      const d = r ? await r.json().catch(() => null) : null;
      setBusy(false);
      if (!r?.ok) return toast.error(d?.error || 'Could not assign. Try again.');
      toast.success(`Given to ${pick}`);
      setData({ ...data, current: pick });
   };

   return (
      <div className="mt-6 rounded-xl border bg-background p-3">
         <div className="mb-2 text-xs font-medium text-muted-foreground">Intern</div>
         {data.current ? (
            <p className="text-sm">
               With <span className="font-medium">{data.current}</span>. They see it in the intern
               app.
            </p>
         ) : (
            <div className="flex items-center gap-2">
               <select
                  className="h-8 flex-1 rounded-md border bg-background px-2 text-sm"
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  aria-label="Intern"
               >
                  {data.interns.map((n) => (
                     <option key={n} value={n}>
                        {n}
                     </option>
                  ))}
               </select>
               <Button size="sm" onClick={assign} disabled={busy || !pick}>
                  Hand to intern
               </Button>
            </div>
         )}
      </div>
   );
}
