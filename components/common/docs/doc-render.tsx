'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, FileText, Maximize2, X } from 'lucide-react';

/** Base URL for streaming attachments — the internal reader uses the ops route;
 *  the share page overrides it with its token-gated route. */
const AttachmentBase = createContext('/api/ops/attachments');

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

/** An interactive artifact (```artifact fenced block) — the block's HTML/JS is
 *  run in a sandboxed, same-origin-less iframe (like a Claude artifact) and
 *  auto-sized to its content. It cannot touch the app, cookies, or storage. */
function ArtifactFrame({ html }: { html: string }) {
   const [h, setH] = useState(260);
   const afid = useRef('af-' + Math.random().toString(36).slice(2));
   useEffect(() => {
      const onMsg = (e: MessageEvent) => {
         const data = e.data as { __afid?: string; height?: number } | null;
         if (data && data.__afid === afid.current && typeof data.height === 'number') {
            setH(Math.min(6000, Math.max(80, Math.ceil(data.height))));
         }
      };
      window.addEventListener('message', onMsg);
      return () => window.removeEventListener('message', onMsg);
   }, []);
   const doc =
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>*{box-sizing:border-box}body{margin:0;padding:16px;font:14px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a}</style></head><body>' +
      html +
      '<script>(function(){var id=' +
      JSON.stringify(afid.current) +
      ';function s(){parent.postMessage({__afid:id,height:document.documentElement.scrollHeight},"*")}try{new ResizeObserver(s).observe(document.body)}catch(e){}window.addEventListener("load",s);setTimeout(s,60);setTimeout(s,300)})();<\/script></body></html>';
   return (
      <iframe
         title="Interactive"
         sandbox="allow-scripts"
         srcDoc={doc}
         style={{ height: h }}
         className="my-5 w-full rounded-xl border bg-white"
      />
   );
}

/** An inline PDF reference — a card that opens the file in a full modal viewer.
 *  Streams through the attachment base URL (auth'd internally / share-gated). */
function PdfViewer({ id, name }: { id: string; name: string }) {
   const base = useContext(AttachmentBase);
   const [open, setOpen] = useState(false);
   const url = `${base}/${id}`;
   return (
      <div className="my-4">
         <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl border bg-card p-3.5 text-left transition-colors hover:border-primary"
         >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
               <FileText className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
               <span className="block truncate text-sm font-medium">{name}</span>
               <span className="text-xs text-muted-foreground">PDF · click to open</span>
            </span>
            <Maximize2 className="size-4 shrink-0 text-muted-foreground" />
         </button>
         {open &&
            createPortal(
               <div
                  className="fixed inset-0 z-50 flex flex-col bg-black/70 p-2 sm:p-3"
                  onClick={() => setOpen(false)}
               >
                  <div
                     className="mx-auto flex h-full w-full max-w-[1600px] flex-col overflow-hidden rounded-xl border bg-background shadow-xl"
                     onClick={(e) => e.stopPropagation()}
                  >
                     <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
                        <span className="truncate text-sm font-medium">{name}</span>
                        <div className="flex shrink-0 items-center gap-3">
                           <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-muted-foreground hover:text-foreground"
                           >
                              Open in new tab
                           </a>
                           <button
                              type="button"
                              onClick={() => setOpen(false)}
                              aria-label="Close"
                              className="text-muted-foreground hover:text-foreground"
                           >
                              <X className="size-5" />
                           </button>
                        </div>
                     </div>
                     <iframe src={url} title={name} className="w-full flex-1" />
                  </div>
               </div>,
               document.body
            )}
      </div>
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
   if (lang === 'artifact') return <ArtifactFrame html={raw} />;
   if (lang === 'pdf') {
      const id = /(?:^|\n)\s*id:\s*([\w-]+)/i.exec(raw)?.[1] ?? '';
      const name = (/(?:^|\n)\s*name:\s*(.+)/i.exec(raw)?.[1] ?? 'Document.pdf').trim();
      return id ? (
         <PdfViewer id={id} name={name} />
      ) : (
         <p className="my-2 text-xs text-muted-foreground">PDF reference is missing its id.</p>
      );
   }
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

/** Render a markdown doc body with the shared prose + diagram + PDF support.
 *  `attachmentBase` overrides where PDFs stream from (share page passes its
 *  token-gated route). */
export function DocMarkdown({ body, attachmentBase }: { body: string; attachmentBase?: string }) {
   return (
      <AttachmentBase.Provider value={attachmentBase ?? '/api/ops/attachments'}>
         <div className={PROSE}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
               {body}
            </ReactMarkdown>
         </div>
      </AttachmentBase.Provider>
   );
}
