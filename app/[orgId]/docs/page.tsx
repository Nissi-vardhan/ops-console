import MainLayout from '@/components/layout/main-layout';
import { DocsView } from '@/components/common/docs/docs-view';
import { SidebarTrigger } from '@/components/ui/sidebar';

export default function DocsPage() {
   return (
      <MainLayout
         header={
            <div className="flex h-10 w-full items-center gap-3 border-b px-3 py-1.5 sm:px-6">
               <SidebarTrigger />
               <span className="text-sm font-medium">Docs</span>
            </div>
         }
         headersNumber={1}
      >
         <DocsView />
      </MainLayout>
   );
}
