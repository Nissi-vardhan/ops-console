import MainLayout from '@/components/layout/main-layout';
import { InfraView } from '@/components/common/infra/infra-view';
import { TopHeader } from '@/components/layout/top-header';

export default function InfraPage() {
   return (
      <MainLayout header={<TopHeader title="Infra & tokens" />} headersNumber={1}>
         <InfraView />
      </MainLayout>
   );
}
