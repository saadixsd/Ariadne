"use client";
/*
  Reads text out of a file in the browser. Nothing is uploaded: the Worker only ever gets
  the extracted text (lib/sources.ts caps it). PDF via pdf.js and DOCX via mammoth, both
  loaded on demand from /vendor (static assets, never in the Worker bundle).
  Scanned PDFs have no text layer; we say so instead of guessing.
*/
import { MAX_SOURCE_CHARS } from "@/lib/sources";

export const ACCEPT = ".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain";
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

const PDFJS = "/vendor/pdfjs-4.10.38/pdf.min.mjs";
const PDFJS_WORKER = "/vendor/pdfjs-4.10.38/pdf.worker.min.mjs";
const MAMMOTH = "/vendor/mammoth-1.13.0/mammoth.browser.min.js";

type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: ArrayBuffer }): { promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: { str?: string; hasEOL?: boolean }[] }> }> }> };
};
type Mammoth = { extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }> };

let pdfjs: Promise<PdfJs> | null = null;
let mammoth: Promise<Mammoth> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ PDFJS) as Promise<PdfJs>).then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return lib;
  });
  return pdfjs;
}

function loadMammoth(): Promise<Mammoth> {
  mammoth ??= new Promise((resolve, reject) => {
    const w = window as unknown as { mammoth?: Mammoth };
    if (w.mammoth) return resolve(w.mammoth);
    const script = document.createElement("script");
    script.src = MAMMOTH;
    script.onload = () => (w.mammoth ? resolve(w.mammoth) : reject(new Error("Could not load the DOCX reader")));
    script.onerror = () => reject(new Error("Could not load the DOCX reader"));
    document.head.appendChild(script);
  });
  return mammoth;
}

export type Extracted = { name: string; mime: string | null; bytes: number; text: string; truncated: boolean };

function kindOf(file: File): "pdf" | "docx" | "text" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (/\.(md|markdown|txt)$/.test(name) || file.type.startsWith("text/")) return "text";
  return null;
}

export async function extractText(file: File): Promise<Extracted> {
  const kind = kindOf(file);
  if (!kind) throw new Error("Use a PDF, DOCX, Markdown or text file");
  if (file.size > MAX_FILE_BYTES) throw new Error("Files up to 15 MB");
  let text = "";
  if (kind === "text") {
    text = await file.text();
  } else if (kind === "docx") {
    const lib = await loadMammoth();
    text = (await lib.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  } else {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(content.items.map((item) => (item.str ?? "") + (item.hasEOL ? "\n" : " ")).join(""));
      if (pages.join("\n").length > MAX_SOURCE_CHARS) break;
    }
    text = pages.join("\n\n");
    if (!text.trim()) throw new Error("No text in this PDF (it may be scanned). Paste the text instead.");
  }
  text = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("No text was found in this file");
  const truncated = text.length > MAX_SOURCE_CHARS;
  return { name: file.name, mime: file.type || null, bytes: file.size, text: truncated ? text.slice(0, MAX_SOURCE_CHARS) : text, truncated };
}
