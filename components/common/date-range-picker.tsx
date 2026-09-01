'use client';

import { useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { CalendarDays } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';

export interface Range {
   from?: Date;
   to?: Date;
}

const atStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const today = () => atStart(new Date());

const PRESETS: { label: string; get: () => Range }[] = [
   {
      label: 'This month',
      get: () => ({
         from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
         to: today(),
      }),
   },
   {
      label: 'Last month',
      get: () => {
         const n = new Date();
         return {
            from: new Date(n.getFullYear(), n.getMonth() - 1, 1),
            to: new Date(n.getFullYear(), n.getMonth(), 0),
         };
      },
   },
   {
      label: 'Last 3 months',
      get: () => ({ from: atStart(new Date(Date.now() - 90 * 864e5)), to: today() }),
   },
   {
      label: 'Year to date',
      get: () => ({ from: new Date(new Date().getFullYear(), 0, 1), to: today() }),
   },
   {
      label: 'Last 12 months',
      get: () => ({ from: atStart(new Date(Date.now() - 365 * 864e5)), to: today() }),
   },
];

const fmtDay = (d?: Date) =>
   d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';

function label(r?: Range): string {
   if (!r?.from) return 'All time';
   if (!r.to || +r.from === +r.to) return fmtDay(r.from);
   return `${fmtDay(r.from)} – ${fmtDay(r.to)}`;
}

/** Presets + dual-month range calendar + Clear/Apply. Emits {from,to} on Apply. */
export function DateRangePicker({
   value,
   onChange,
   className,
}: {
   value?: Range;
   onChange: (r: Range) => void;
   className?: string;
}) {
   const [open, setOpen] = useState(false);
   const [draft, setDraft] = useState<DateRange | undefined>(
      value?.from ? { from: value.from, to: value.to } : undefined
   );

   const days =
      draft?.from && draft?.to
         ? Math.round((+draft.to - +draft.from) / 864e5) + 1
         : draft?.from
           ? 1
           : 0;

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={className}>
               <CalendarDays className="mr-1.5 size-4" />
               {label(value)}
            </Button>
         </PopoverTrigger>
         <PopoverContent align="end" className="w-auto p-0">
            <div className="flex flex-col sm:flex-row">
               <div className="flex shrink-0 flex-col gap-0.5 border-b p-2 sm:w-40 sm:border-b-0 sm:border-r">
                  {PRESETS.map((p) => (
                     <button
                        key={p.label}
                        onClick={() => setDraft(p.get() as DateRange)}
                        className="rounded-md px-2.5 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:bg-muted"
                     >
                        {p.label}
                     </button>
                  ))}
               </div>
               <div className="p-2">
                  <Calendar
                     mode="range"
                     numberOfMonths={2}
                     selected={draft}
                     onSelect={setDraft}
                     defaultMonth={draft?.from ?? new Date()}
                  />
                  <div className="mt-1 flex items-center justify-between border-t pt-2">
                     <span className="pl-1 text-xs text-muted-foreground">
                        {days ? `${days} day${days === 1 ? '' : 's'}` : 'Pick a range'}
                     </span>
                     <div className="flex items-center gap-1">
                        <Button
                           size="xs"
                           variant="ghost"
                           onClick={() => {
                              setDraft(undefined);
                              onChange({});
                              setOpen(false);
                           }}
                        >
                           Clear
                        </Button>
                        <Button
                           size="xs"
                           disabled={!draft?.from}
                           onClick={() => {
                              onChange({ from: draft?.from, to: draft?.to ?? draft?.from });
                              setOpen(false);
                           }}
                        >
                           Apply
                        </Button>
                     </div>
                  </div>
               </div>
            </div>
         </PopoverContent>
      </Popover>
   );
}
