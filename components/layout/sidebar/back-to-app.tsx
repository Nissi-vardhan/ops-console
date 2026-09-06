import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export function BackToApp() {
   return (
      <div className="w-full flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
         <Button
            className="w-fit group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0"
            size="xs"
            variant="outline"
            title="Back to app"
            asChild
         >
            <Link href="/shortcastle/team/CORE/all">
               <ChevronLeft className="size-4" />
               <span className="group-data-[collapsible=icon]:hidden">Back to app</span>
            </Link>
         </Button>
         <div className="group-data-[collapsible=icon]:hidden">
            <ThemeToggle />
         </div>
      </div>
   );
}
