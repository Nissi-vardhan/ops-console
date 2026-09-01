import type { ComponentType, ReactNode } from 'react';

/** Consistent in-view page header: icon + title, optional subtitle, right-aligned actions. */
export function PageHeader({
   title,
   subtitle,
   icon: Icon,
   actions,
}: {
   title: string;
   subtitle?: ReactNode;
   icon?: ComponentType<{ className?: string }>;
   actions?: ReactNode;
}) {
   return (
      <div className="flex flex-wrap items-center justify-between gap-3">
         <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
               {Icon && <Icon className="size-5 shrink-0 text-primary" />}
               {title}
            </h1>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
         </div>
         {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
   );
}
