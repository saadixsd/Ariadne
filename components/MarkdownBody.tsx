"use client";

import type { ComponentProps } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/*
  Agent output, typeset. Markdown (GFM: headings, lists, code, tables, links) is
  rendered by react-markdown WITHOUT raw HTML, so model text can never inject markup
  or scripts. Links keep only http(s)/mailto targets and open in a new tab without
  a referrer; images are shown as links instead of being fetched.

  Loaded lazily by <Markdown> (components/OutputView.tsx) in the browser only.
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

export default function MarkdownBody({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={safeUrl} skipHtml>
      {text}
    </ReactMarkdown>
  );
}
