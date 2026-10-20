import MainLayout from '@/components/layout/main-layout';
import { KbManager } from '@/components/common/kb/kb-manager';
import { TopHeader } from '@/components/layout/top-header';

export default function KbPage() {
   return (
      <MainLayout header={<TopHeader title="Knowledge Base" />} headersNumber={1}>
         <KbManager />
      </MainLayout>
   );
}
