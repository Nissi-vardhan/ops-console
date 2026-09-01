import MainLayout from '@/components/layout/main-layout';
import { DailyView } from '@/components/common/daily/daily-view';
import { TopHeader } from '@/components/layout/top-header';

export default function DailyPage() {
   return (
      <MainLayout header={<TopHeader title="Daily Update" />} headersNumber={1}>
         <DailyView />
      </MainLayout>
   );
}
