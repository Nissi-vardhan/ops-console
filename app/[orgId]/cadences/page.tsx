import MainLayout from '@/components/layout/main-layout';
import { CadencesView } from '@/components/common/cadences/cadences-view';
import { TopHeader } from '@/components/layout/top-header';

export default function CadencesPage() {
   return (
      <MainLayout header={<TopHeader title="Cadences" />} headersNumber={1}>
         <CadencesView />
      </MainLayout>
   );
}
