import MainLayout from '@/components/layout/main-layout';
import { InternsView } from '@/components/common/interns/interns-view';
import { TopHeader } from '@/components/layout/top-header';

export default function InternsPage() {
   return (
      <MainLayout header={<TopHeader title="Interns" />} headersNumber={1}>
         <InternsView />
      </MainLayout>
   );
}
