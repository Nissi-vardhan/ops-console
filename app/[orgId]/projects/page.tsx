import MainLayout from '@/components/layout/main-layout';
import { ProjectsView } from '@/components/common/projects/projects-view';
import { SidebarTrigger } from '@/components/ui/sidebar';

export default function ProjectsPage() {
   return (
      <MainLayout
         header={
            <div className="flex h-10 w-full items-center gap-3 border-b px-3 py-1.5 sm:px-6">
               <SidebarTrigger />
               <span className="text-sm font-medium">Projects</span>
            </div>
         }
         headersNumber={1}
      >
         <ProjectsView />
      </MainLayout>
   );
}
