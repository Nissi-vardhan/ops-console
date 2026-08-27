import MainLayout from '@/components/layout/main-layout';
import { OpsDashboard } from '@/components/common/dashboard/ops-dashboard';
import { SidebarTrigger } from '@/components/ui/sidebar';

export default function DashboardPage() {
   return (
      <MainLayout
         header={
            <div className="flex h-10 w-full items-center gap-3 border-b px-3 py-1.5 sm:px-6">
               <SidebarTrigger />
               <span className="text-sm font-medium">Dashboard</span>
            </div>
         }
         headersNumber={1}
      >
         <OpsDashboard />
      </MainLayout>
   );
}
