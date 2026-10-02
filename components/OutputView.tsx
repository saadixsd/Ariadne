"use client";

import { memo, useState, type ComponentProps, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { extractHtmlDocument } from "@/lib/html-preview";
import { foldPlan } from "@/lib/text-fold";

/*
  Agent output, typeset. Markdown (GFM: headings, lists, code, tables, links) is
  rendered by react-markdown WITHOUT raw HTML, so model text can never inject markup
  or scripts. Links keep only http(s)/mailto targets and open in a new tab without
  a referrer; images are shown as links instead of being fetched.
*/

function safeUrl(url: string): string {
  const cleaned = defaultUrlTransform(url);
  return /^(https?:|mailto:|#)/i.test(cleaned) ? cleaned : "";
}

const components: Components = {
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ src, alt }) =>
    typeof src === "string" && src ? (
      <a href={src} target="_blank" rel="noopener noreferrer nofollow">
        [image{alt ? `: ${alt}` : ""}]
      </a>
    ) : null,
  table: (props: ComponentProps<"table">) => (
    <div className="md-table">
      <table {...props} />
    </div>
  ),
};

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={safeUrl} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
});

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => setState("copied"))
          .catch(() => setState("failed"))
          .finally(() => window.setTimeout(() => setState("idle"), 1800));
      }}
      className="rt-btn rt-btn-ghost h-7 px-2 text-xs"
      aria-live="polite"
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : label}
    </button>
  );
}

/**
 * The output of one step: typeset, a comfortable measure, long text folded behind
 * "Read more", a copy button, and (optionally) a way to open it beside its inputs.
 */
export const OutputView = memo(function OutputView({
  output,
  onCompare,
  foldable = true,
  extraTools,
}: {
  output: string;
  onCompare?: () => void;
  foldable?: boolean;
  /** More controls for the tool row (e.g. "v1 → v2"), shown before the rest. */
  extraTools?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const html = extractHtmlDocument(output);
  const plan = foldPlan(output);
  const folded = foldable && plan.fold && !open;

  const tools = (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {extraTools}
      {onCompare ? (
        <button type="button" onClick={onCompare} className="rt-btn rt-btn-ghost h-7 px-2 text-xs">
          Beside its inputs
        </button>
      ) : null}
      <CopyButton text={output} />
    </div>
  );

  if (html) {
    return (
      <div className="space-y-3">
        {tools}
        <iframe title="Generated page" sandbox="" srcDoc={html} className="block h-[min(28rem,60vh)] w-full max-w-full rounded-lg border border-line bg-white" />
        <details className="rounded-lg bg-canvas ring-1 ring-line">
          <summary className="cursor-pointer px-3 py-2 text-xs font-[560] text-ink-dim">
            Page source · {html.split("\n").length} lines
          </summary>
          <pre className="border-t border-line p-3 font-mono text-xs leading-normal break-words whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{html}</pre>
        </details>
      </div>
    );
  }

  return (
    <div>
      {tools}
      <div className={folded ? "fold-fade max-h-[19rem] overflow-hidden" : undefined}>
        <Markdown text={output} />
      </div>
      {foldable && plan.fold ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="mt-1 text-xs font-[560] text-thread hover:text-thread-bright"
        >
          {open ? "Fold it back" : `Read more · ${plan.label}`}
        </button>
      ) : null}
    </div>
  );
});
