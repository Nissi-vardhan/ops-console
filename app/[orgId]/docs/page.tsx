import MainLayout from '@/components/layout/main-layout';
import { DocsView } from '@/components/common/docs/docs-view';
import { TopHeader } from '@/components/layout/top-header';

export default function DocsPage() {
   return (
      <MainLayout header={<TopHeader title="Docs" />} headersNumber={1}>
         <DocsView />
      </MainLayout>
   );
}
