import MainLayout from '@/components/layout/main-layout';
import { WorkspacesView } from '@/components/common/workspaces/workspaces-view';
import { TopHeader } from '@/components/layout/top-header';

export default function WorkspacesPage() {
   return (
      <MainLayout header={<TopHeader title="Workspaces" />} headersNumber={1}>
         <WorkspacesView />
      </MainLayout>
   );
}
