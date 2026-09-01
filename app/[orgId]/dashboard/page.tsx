import MainLayout from '@/components/layout/main-layout';
import { OpsDashboard } from '@/components/common/dashboard/ops-dashboard';
import { TopHeader } from '@/components/layout/top-header';

export default function DashboardPage() {
   return (
      <MainLayout header={<TopHeader title="Dashboard" />} headersNumber={1}>
         <OpsDashboard />
      </MainLayout>
   );
}
