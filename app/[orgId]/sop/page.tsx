import MainLayout from '@/components/layout/main-layout';
import { DocsView } from '@/components/common/docs/docs-view';
import { TopHeader } from '@/components/layout/top-header';

// SC-701: Standard operating procedures, the docs of type "SOP", with the same workspace filter
// and Staging/Production split as Docs. Doc links (/<ws>/docs?doc=<id>) keep working there too.
export default function SopPage() {
   return (
      <MainLayout header={<TopHeader title="SOP" />} headersNumber={1}>
         <DocsView only="SOP" />
      </MainLayout>
   );
}
