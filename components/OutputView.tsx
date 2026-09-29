import ReactMarkdown from "react-markdown";
import { extractHtmlDocument } from "@/lib/html-preview";

export function OutputView({ output }: { output: string }) {
  const html = extractHtmlDocument(output);
  if (html) {
    return (
      <div className="space-y-3">
        <iframe
          title="Landing page preview"
          sandbox=""
          srcDoc={html}
          className="h-80 w-full border border-line bg-white"
        />
        <pre className="max-h-48 overflow-auto bg-base p-3 font-mono text-xs leading-normal text-ink ring-1 ring-line">
          {html}
        </pre>
      </div>
    );
  }

  return (
    <div className="markdown font-mono text-sm leading-normal text-ink">
      <ReactMarkdown>{output}</ReactMarkdown>
    </div>
  );
}
