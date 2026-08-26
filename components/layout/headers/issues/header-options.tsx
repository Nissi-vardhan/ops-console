'use client';

import { IssueFilterTrigger } from '@/components/common/issues/issue-filter-trigger';
import { DisplayOptions } from '../display-options';

export default function HeaderOptions() {
   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-3 sm:px-6 h-10">
         <div />
         <div className="flex items-center gap-1">
            <IssueFilterTrigger />
            <DisplayOptions />
         </div>
      </div>
   );
}
