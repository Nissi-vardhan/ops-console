'use client';

// Recharts-backed dashboard charts, split into their own module so recharts
// (+ its d3 deps, ~300-400KB) is code-split OUT of the dashboard's first-paint
// bundle. Loaded via next/dynamic({ ssr:false }) from ops-dashboard.tsx; the
// KPI tiles render eagerly while these lazy-load behind a skeleton.

import {
   Bar as RBar,
   CartesianGrid,
   Cell,
   ComposedChart,
   Line,
   LineChart,
   Pie,
   PieChart,
   ResponsiveContainer,
   Tooltip,
   XAxis,
   YAxis,
} from 'recharts';

const RTIP = {
   background: 'var(--popover)',
   border: '1px solid var(--border)',
   borderRadius: 8,
   fontSize: 12,
   color: 'var(--popover-foreground)',
   padding: '6px 10px',
} as const;

interface TipProps {
   active?: boolean;
   label?: string;
   weekly?: boolean;
   payload?: { dataKey?: string; value?: number }[];
}
function ActivityTip({ active, payload, label, weekly }: TipProps) {
   if (!active || !payload?.length) return null;
   const created = payload.find((p) => p.dataKey === 'count')?.value ?? 0;
   return (
      <div style={RTIP}>
         <div className="text-muted-foreground">
            {weekly ? 'Week of ' : ''}
            {label}
         </div>
         <div className="font-medium tabular-nums text-foreground">{created} created</div>
      </div>
   );
}

/** Compact mini trend shown inline beside the delta on a KPI tile. */
export function Spark({ data, color = 'var(--primary)' }: { data: number[]; color?: string }) {
   if (!data.some(Boolean)) return null;
   return (
      <div className="h-6 w-16 shrink-0">
         <ResponsiveContainer width="100%" height="100%">
            <LineChart
               data={data.map((v, i) => ({ i, v }))}
               margin={{ top: 2, right: 0, left: 0, bottom: 2 }}
            >
               <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.6} dot={false} />
            </LineChart>
         </ResponsiveContainer>
      </div>
   );
}

/** Tasks-created activity: bars (count) + rolling-average line. */
export function ActivityChart({
   data,
   weekly,
   reduce,
}: {
   data: { day: string; count: number; avg: number }[];
   weekly: boolean;
   reduce: boolean;
}) {
   return (
      <ResponsiveContainer width="100%" height="100%">
         <ComposedChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <defs>
               <linearGradient id="createdFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.85} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.28} />
               </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
            <XAxis
               dataKey="day"
               tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
               tickLine={false}
               axisLine={false}
               interval="preserveStartEnd"
               minTickGap={24}
            />
            <YAxis
               width={26}
               allowDecimals={false}
               tickLine={false}
               axisLine={false}
               tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            />
            <Tooltip
               cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
               content={<ActivityTip weekly={weekly} />}
            />
            <RBar
               dataKey="count"
               fill="url(#createdFill)"
               radius={[3, 3, 0, 0]}
               maxBarSize={26}
               isAnimationActive={!reduce}
            />
            <Line
               type="monotone"
               dataKey="avg"
               stroke="var(--chart-2)"
               strokeWidth={2}
               dot={false}
               isAnimationActive={!reduce}
            />
         </ComposedChart>
      </ResponsiveContainer>
   );
}

/** Tasks-by-status donut. */
export function StatusDonut({
   data,
   reduce,
}: {
   data: { name: string; value: number; color: string }[];
   reduce: boolean;
}) {
   return (
      <ResponsiveContainer width="100%" height="100%">
         <PieChart>
            <Tooltip
               contentStyle={RTIP}
               itemStyle={{ color: 'var(--popover-foreground)' }}
               labelStyle={{ color: 'var(--popover-foreground)' }}
            />
            <Pie
               data={data}
               dataKey="value"
               nameKey="name"
               cx="50%"
               cy="50%"
               innerRadius={58}
               outerRadius={80}
               paddingAngle={2}
               stroke="none"
               cornerRadius={6}
               isAnimationActive={!reduce}
            >
               {data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
               ))}
            </Pie>
         </PieChart>
      </ResponsiveContainer>
   );
}
