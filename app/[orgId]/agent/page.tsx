import MainLayout from '@/components/layout/main-layout';
import { TopHeader } from '@/components/layout/top-header';
import { AskView } from '@/components/common/ask/ask-view';

// "Ask" (SC-368): team questions answered from the KB. Replaces the template's mock agent chat.
export default function AskPage() {
   return (
      <MainLayout header={<TopHeader title="Ask" />} headersNumber={1}>
         <AskView />
      </MainLayout>
   );
}
