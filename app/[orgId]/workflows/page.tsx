import MainLayout from '@/components/layout/main-layout';
import { WorkflowsView } from '@/components/common/workflows/workflows-view';
import { TopHeader } from '@/components/layout/top-header';

export default function WorkflowsPage() {
   return (
      <MainLayout header={<TopHeader title="Workflows" />} headersNumber={1}>
         <WorkflowsView />
      </MainLayout>
   );
}
