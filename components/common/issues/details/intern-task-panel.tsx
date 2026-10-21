'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import type { Issue } from '@/mock-data/issues';

// Intern mode (SC-430): the task's facts (read-only) and the intern's own actions, which go
// through the intern Task API (/v1) with the same rules as before.

type Action = 'start' | 'progress' | 'stuck' | 'unstuck' | 'close';
const ASK: Record<
   Exclude<Action, 'start'>,
   { title: string; hint: string; label: string; required: boolean }
> = {
   progress: { title: 'Add progress', hint: 'What did you do?', label: 'Update', required: true },
   stuck: {
      title: "I'm stuck",
      hint: 'Say why, so your reviewer can help.',
      label: 'Reason',
      required: true,
   },
   unstuck: {
      title: 'Resume',
      hint: 'Optional: what unblocked you?',
      label: 'Note',
      required: false,
   },
   close: {
      title: 'Submit for review',
      hint: 'Summarise what you did (at least 20 characters). After this, wait for feedback.',
      label: 'Summary',
      required: true,
   },
};

function stageOf(statusId: string) {
   if (statusId === 'in-progress') return 'in_progress';
   if (statusId === 'blocked') return 'stuck';
   if (statusId === 'technical-review') return 'submitted';
   if (statusId === 'done' || statusId === 'canceled') return 'finished';
   return 'assigned';
}

export function InternTaskPanel({ issue }: { issue: Issue }) {
   const [open, setOpen] = useState<Exclude<Action, 'start'> | null>(null);
   const [text, setText] = useState('');
   const [error, setError] = useState('');
   const [busy, setBusy] = useState(false);
   const stage = stageOf(issue.status.id);

   const run = async (action: Action, body = '') => {
      setBusy(true);
      setError('');
      const r = await fetch(`/v1/tasks/${encodeURIComponent(issue.identifier)}/${action}`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'X-Portal': '1' },
         body: JSON.stringify({ text: body }),
      }).catch(() => null);
      const d = r ? await r.json().catch(() => null) : null;
      setBusy(false);
      if (!r?.ok) {
         const msg = d?.error || 'Something went wrong. Try again.';
         if (open) setError(msg);
         else toast.error(msg);
         return;
      }
      toast.success('Saved');
      window.location.reload();
   };

   const row = (label: string, value: React.ReactNode) => (
      <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
         <span className="text-muted-foreground">{label}</span>
         <span className="text-right">{value}</span>
      </div>
   );

   return (
      <div className="space-y-5">
         <div>
            {row('Task', <span className="font-mono text-xs">{issue.identifier}</span>)}
            {row(
               'Status',
               <span className="inline-flex items-center gap-1.5">
                  <span
                     className="size-2 rounded-full"
                     style={{ backgroundColor: issue.status.color }}
                  />
                  {issue.status.name}
               </span>
            )}
            {row('Priority', issue.priority.name)}
            {issue.dueDate && row('Due', new Date(issue.dueDate).toLocaleDateString('en-GB'))}
         </div>

         <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
               Your actions
            </p>
            {stage === 'assigned' && (
               <Button className="w-full" disabled={busy} onClick={() => run('start')}>
                  Start
               </Button>
            )}
            {(stage === 'assigned' || stage === 'in_progress') && (
               <>
                  <Button variant="outline" className="w-full" onClick={() => setOpen('progress')}>
                     Add progress
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => setOpen('stuck')}>
                     I&apos;m stuck
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => setOpen('close')}>
                     Submit for review
                  </Button>
               </>
            )}
            {stage === 'stuck' && (
               <Button className="w-full" onClick={() => setOpen('unstuck')}>
                  Resume
               </Button>
            )}
            {stage === 'submitted' && (
               <p className="text-sm text-muted-foreground">
                  Submitted for review. Wait for feedback.
               </p>
            )}
            {stage === 'finished' && (
               <p className="text-sm text-muted-foreground">This task is finished.</p>
            )}
         </div>

         <Dialog
            open={!!open}
            onOpenChange={(o) => {
               if (!o) {
                  setOpen(null);
                  setText('');
                  setError('');
               }
            }}
         >
            <DialogContent>
               {open && (
                  <>
                     <DialogHeader>
                        <DialogTitle>{ASK[open].title}</DialogTitle>
                        <DialogDescription>{ASK[open].hint}</DialogDescription>
                     </DialogHeader>
                     <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={ASK[open].label}
                        className="min-h-32"
                        autoFocus
                     />
                     {error && <p className="text-sm text-red-600">{error}</p>}
                     <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setOpen(null)}>
                           Cancel
                        </Button>
                        <Button
                           disabled={busy || (ASK[open].required && !text.trim())}
                           onClick={() => run(open, text)}
                        >
                           Save
                        </Button>
                     </DialogFooter>
                  </>
               )}
            </DialogContent>
         </Dialog>
      </div>
   );
}
