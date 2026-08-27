import MainLayout from '@/components/layout/main-layout';
import { SavedView, getView } from '@/components/common/views/saved-views';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { DisplayOptions } from '@/components/layout/headers/display-options';

export default async function ViewPage({ params }: { params: Promise<{ view: string }> }) {
   const { view } = await params;
   const def = getView(view);
   return (
      <MainLayout
         header={
            <div className="flex h-10 w-full items-center justify-between gap-3 border-b px-3 py-1.5 sm:px-6">
               <div className="flex items-center gap-3">
                  <SidebarTrigger />
                  <span className="text-sm font-medium">{def?.name ?? 'View'}</span>
                  {def && <span className="hidden text-xs text-muted-foreground sm:inline">{def.description}</span>}
               </div>
               <DisplayOptions />
            </div>
         }
         headersNumber={1}
      >
         <SavedView viewKey={view} />
      </MainLayout>
   );
}
