import MainLayout from '@/components/layout/main-layout';
import { ProjectsView } from '@/components/common/projects/projects-view';
import { TopHeader } from '@/components/layout/top-header';

export default function ProjectsPage() {
   return (
      <MainLayout header={<TopHeader title="Projects" />} headersNumber={1}>
         <ProjectsView />
      </MainLayout>
   );
}
