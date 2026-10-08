import MainLayout from '@/components/layout/main-layout';
import { AutomationsView } from '@/components/common/automations/automations-view';
import { TopHeader } from '@/components/layout/top-header';

export default function AutomationsPage() {
   return (
      <MainLayout header={<TopHeader title="Automations" />} headersNumber={1}>
         <AutomationsView />
      </MainLayout>
   );
}
