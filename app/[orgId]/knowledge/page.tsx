import MainLayout from '@/components/layout/main-layout';
import { KnowledgeView } from '@/components/common/knowledge/knowledge-view';
import { TopHeader } from '@/components/layout/top-header';

export default function KnowledgePage() {
   return (
      <MainLayout header={<TopHeader title="Knowledge" />} headersNumber={1}>
         <KnowledgeView />
      </MainLayout>
   );
}
