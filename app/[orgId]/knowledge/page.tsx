import MainLayout from '@/components/layout/main-layout';
import { KnowledgeView } from '@/components/common/knowledge/knowledge-view';
import { SidebarTrigger } from '@/components/ui/sidebar';

export default function KnowledgePage() {
   return (
      <MainLayout
         header={
            <div className="flex h-10 w-full items-center gap-3 border-b px-3 py-1.5 sm:px-6">
               <SidebarTrigger />
               <span className="text-sm font-medium">Knowledge</span>
            </div>
         }
         headersNumber={1}
      >
         <KnowledgeView />
      </MainLayout>
   );
}
