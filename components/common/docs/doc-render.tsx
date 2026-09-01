'use client';

import { useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

/* Shared markdown rendering for docs — used by the ops Docs reader and the
 * public share page, so both look identical. */

export const slug = (s: string) =>
   s
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

export function nodeText(node: ReactNode): string {
   if (node == null || node === false) return '';
   if (typeof node === 'string' || typeof node === 'number') return String(node);
   if (Array.isArray(node)) return node.map(nodeText).join('');
   if (typeof node === 'object' && 'props' in node) {
      return nodeText((node as { props: { children?: ReactNode } }).props.children);
   }
   return '';
}

export interface Heading {
   level: number;
   text: string;
   id: string;
}

/** Pull h2/h3 headings out of the markdown source (ignoring fenced code). */
export function outline(body: string): Heading[] {
   const out: Heading[] = [];
   let fenced = false;
   for (const raw of body.split('\n')) {
      const line = raw.trimEnd();
      if (/^\s*```/.test(line)) {
         fenced = !fenced;
         continue;
      }
      if (fenced) continue;
      const m = /^(#{2,3})\s+(.+?)\s*#*$/.exec(line);
      if (m) {
         const text = m[2].replace(/[*_`]/g, '').trim();
         out.push({ level: m[1].length, text, id: slug(text) });
      }
   }
   return out;
}

export const PROSE = [
   'text-[15px] leading-7 text-foreground/90',
   '[&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:text-[26px] [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:scroll-mt-24',
   '[&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:scroll-mt-24',
   '[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:scroll-mt-24',
   '[&_p]:my-3.5',
   '[&_ul]:my-3.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_li]:pl-1',
   '[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-80',
   '[&_strong]:font-semibold [&_strong]:text-foreground',
   '[&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[13px]',
   '[&_blockquote]:my-4 [&_blockquote]:rounded-r-md [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:bg-muted/30 [&_blockquote]:py-1 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
   '[&_table]:my-4 [&_table]:block [&_table]:overflow-x-auto [&_table]:text-sm [&_thead]:border-b [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_td]:px-3 [&_td]:py-2 [&_tr]:border-b [&_tr]:border-border/60',
   '[&_hr]:my-8 [&_hr]:border-border',
   '[&_img]:my-4 [&_img]:rounded-lg [&_img]:border',
].join(' ');

function Mermaid({ chart }: { chart: string }) {
   const [svg, setSvg] = useState('');
   const [failed, setFailed] = useState(false);
   useEffect(() => {
      let alive = true;
      (async () => {
         try {
            const mermaid = (await import('mermaid')).default;
            const dark = document.documentElement.classList.contains('dark');
            mermaid.initialize({
               startOnLoad: false,
               securityLevel: 'strict',
               theme: dark ? 'dark' : 'neutral',
               fontFamily: 'inherit',
            });
            const { svg } = await mermaid.render(
               'mmd-' + Math.random().toString(36).slice(2),
               chart
            );
            if (alive) setSvg(svg);
         } catch {
            if (alive) setFailed(true);
         }
      })();
      return () => {
         alive = false;
      };
   }, [chart]);
   if (failed) {
      return (
         <pre className="my-4 overflow-x-auto rounded-lg border bg-muted/40 p-3.5 font-mono text-[12.5px]">
            {chart}
         </pre>
      );
   }
   return (
      <div
         className="my-5 flex justify-center overflow-x-auto rounded-xl border bg-background/50 p-5 [&_svg]:h-auto [&_svg]:max-w-full"
         dangerouslySetInnerHTML={{ __html: svg }}
      />
   );
}

function CodeBlock({ children }: { children?: ReactNode }) {
   const [copied, setCopied] = useState(false);
   const raw = nodeText(children).replace(/\n$/, '');
   const child = Array.isArray(children) ? children[0] : children;
   const className =
      child && typeof child === 'object' && 'props' in child
         ? String((child as { props?: { className?: string } }).props?.className ?? '')
         : '';
   const lang = /language-(\w+)/.exec(className)?.[1] ?? '';
   if (lang === 'mermaid') return <Mermaid chart={raw} />;
   const copy = async () => {
      try {
         await navigator.clipboard.writeText(raw);
         setCopied(true);
         setTimeout(() => setCopied(false), 1200);
      } catch {
         /* clipboard blocked */
      }
   };
   return (
      <div className="group relative my-4">
         {lang && (
            <span className="absolute left-3 top-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
               {lang}
            </span>
         )}
         <button
            type="button"
            onClick={copy}
            aria-label="Copy code"
            className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md border bg-background/80 text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
         >
            {copied ? (
               <Check className="size-3.5 text-emerald-500" />
            ) : (
               <Copy className="size-3.5" />
            )}
         </button>
         <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3.5 pt-7 font-mono text-[12.5px] leading-relaxed [&>code]:bg-transparent [&>code]:p-0">
            {children}
         </pre>
      </div>
   );
}

const MD: Components = {
   h1: ({ children }) => <h1 id={slug(nodeText(children))}>{children}</h1>,
   h2: ({ children }) => <h2 id={slug(nodeText(children))}>{children}</h2>,
   h3: ({ children }) => <h3 id={slug(nodeText(children))}>{children}</h3>,
   a: ({ href, children }) => (
      <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
         {children}
      </a>
   ),
   pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
};

/** Render a markdown doc body with the shared prose + diagram support. */
export function DocMarkdown({ body }: { body: string }) {
   return (
      <div className={PROSE}>
         <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
            {body}
         </ReactMarkdown>
      </div>
   );
}
