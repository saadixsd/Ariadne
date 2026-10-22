/*
  Browser renderers for the export picker. Each format's library is loaded only when
  that format is chosen (dynamic import), so neither the Worker nor any page bundle
  carries it. Returns a Blob ready to download.
*/
import { byline, DISCLAIMER, factCheckLine, flaggedClaims, toMarkdown, type ExportFormat, type ExportModel, type Run } from "@/lib/export-doc";

const INK = "1F2328";
const DIM = "5B616B";
const THREAD = "8A5A1E";

export async function renderExport(model: ExportModel, format: ExportFormat): Promise<Blob> {
  if (format === "md") return new Blob([toMarkdown(model)], { type: "text/markdown;charset=utf-8" });
  if (format === "docx") return renderDocx(model);
  if (format === "pptx") return renderPptx(model);
  return renderPdf(model);
}

export const MIME: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  md: "text/markdown",
};

const meta = byline;

/* ---------- Word ---------- */
async function renderDocx(m: ExportModel): Promise<Blob> {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, Table, TableRow, TableCell, WidthType, ShadingType } = d;
  const runs = (rs: Run[]) => rs.map((r) => new TextRun({ text: r.text, bold: r.bold }));
  const H = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(m.title)] }),
    new Paragraph({ children: [new TextRun({ text: meta(m), color: DIM, size: 20 })], spacing: { after: 240 } }),
  ];
  for (const b of m.blocks) {
    if (b.kind === "heading") children.push(new Paragraph({ heading: H[b.level], children: [new TextRun(b.text)] }));
    else if (b.kind === "para") children.push(new Paragraph({ children: runs(b.runs), spacing: { after: 160 } }));
    else if (b.ordered) children.push(new Paragraph({ children: [new TextRun(`${b.ordered}. `), ...runs(b.runs)], indent: { left: 360 * (b.depth + 1), hanging: 360 } }));
    else children.push(new Paragraph({ children: runs(b.runs), bullet: { level: b.depth } }));
  }
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Sources")] }));
  if (!m.sources.length) children.push(new Paragraph("No web sources were cited."));
  for (const s of m.sources)
    children.push(
      new Paragraph({
        indent: { left: 440, hanging: 440 },
        children: [new TextRun(`[${s.n}] ${s.label}. `), new ExternalHyperlink({ link: s.url, children: [new TextRun({ text: s.url, style: "Hyperlink" })] })],
      }),
    );
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Fact-check summary")] }));
  children.push(new Paragraph({ children: [new TextRun(factCheckLine(m))], spacing: { after: 160 } }));
  if (m.claims.length) {
    const cell = (text: string, opts: { bold?: boolean; header?: boolean; note?: string | null } = {}) =>
      new TableCell({
        shading: opts.header ? { type: ShadingType.CLEAR, fill: "EDE7DC", color: "auto" } : undefined,
        children: [
          new Paragraph({ children: [new TextRun({ text, bold: opts.bold || opts.header, size: 20 })] }),
          ...(opts.note ? [new Paragraph({ children: [new TextRun({ text: opts.note, color: DIM, size: 18 })] })] : []),
        ],
      });
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [5600, 1800, 1900],
        rows: [
          new TableRow({ tableHeader: true, children: [cell("Claim", { header: true }), cell("Verdict", { header: true }), cell("Your decision", { header: true })] }),
          ...m.claims.map((c) => new TableRow({ children: [cell(c.claim, { note: c.note }), cell(c.verdict, { bold: c.verdict !== "Matches the source" }), cell(c.decision)] })),
        ],
      }),
    );
  }
  children.push(new Paragraph({ children: [new TextRun({ text: DISCLAIMER, italics: true, color: DIM, size: 18 })], spacing: { before: 240 } }));
  const doc = new Document({
    creator: "Ariadne",
    title: m.title,
    description: "Ariadne deliverable",
    styles: { default: { document: { run: { font: "Calibri", size: 22, color: INK } } } },
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}

/* ---------- PowerPoint ---------- */
function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

async function renderPptx(m: ExportModel): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const p = new PptxGenJS();
  p.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  p.title = m.title;
  p.company = "Ariadne";
  const font = "Calibri";
  const head = (s: ReturnType<typeof p.addSlide>, title: string) => {
    s.background = { color: "FBF8F3" };
    s.addText(title, { x: 0.6, y: 0.35, w: 12.1, h: 0.8, fontFace: font, fontSize: 28, bold: true, color: INK });
    s.addShape(p.ShapeType.line, { x: 0.6, y: 1.15, w: 1.2, h: 0, line: { color: THREAD, width: 2 } });
    s.addText(`Ariadne · ${m.dateLabel}`, { x: 0.6, y: 6.95, w: 12.1, h: 0.35, fontFace: font, fontSize: 10, color: DIM });
  };

  const t = p.addSlide();
  t.background = { color: "FBF8F3" };
  t.addText(m.title, { x: 0.8, y: 2.0, w: 11.7, h: 1.8, fontFace: font, fontSize: 40, bold: true, color: INK, fit: "shrink", valign: "bottom" });
  t.addShape(p.ShapeType.line, { x: 0.8, y: 4.0, w: 1.6, h: 0, line: { color: THREAD, width: 3 } });
  t.addText(
    [
      { text: byline(m), options: { breakLine: true } },
      { text: factCheckLine(m) },
    ],
    { x: 0.8, y: 4.2, w: 11.7, h: 1.4, fontFace: font, fontSize: 16, color: DIM, valign: "top" },
  );

  const findings = m.findings.length ? m.findings : ["See the full answer in the document export."];
  chunk(findings, 6).forEach((group, i, all) => {
    const s = p.addSlide();
    head(s, `Key findings${all.length > 1 ? ` (${i + 1}/${all.length})` : ""}`);
    s.addText(
      group.map((f) => ({ text: clip(f, 260), options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } })),
      { x: 0.6, y: 1.4, w: 12.1, h: 5.4, fontFace: font, fontSize: 18, color: INK, valign: "top", fit: "shrink" },
    );
  });

  const flagged = flaggedClaims(m);
  chunk(flagged, 4).forEach((group, i, all) => {
    const s = p.addSlide();
    head(s, `Flagged claims${all.length > 1 ? ` (${i + 1}/${all.length})` : ""}`);
    const rows = [
      ["Claim", "Verdict", "Your decision"].map((h) => ({ text: h, options: { bold: true, fill: { color: "EDE7DC" } } })),
      ...group.map((c) => [{ text: clip(c.claim, 220) + (c.note ? `\n${clip(c.note, 160)}` : "") }, { text: c.verdict }, { text: c.decision }]),
    ];
    s.addTable(rows, { x: 0.6, y: 1.4, w: 12.1, colW: [7.7, 2.0, 2.4], fontFace: font, fontSize: 13, color: INK, border: { type: "solid", color: "D9D2C5", pt: 0.75 }, valign: "top", autoPage: false });
  });
  if (!flagged.length) {
    const s = p.addSlide();
    head(s, "Flagged claims");
    s.addText(m.claims.length ? "Daedalus flagged no claims: every key claim checked was supported by a source." : "No fact-check results are attached.", { x: 0.6, y: 1.4, w: 12.1, h: 1, fontFace: font, fontSize: 18, color: INK });
  }

  const src = m.sources.length ? m.sources : [];
  chunk(src, 7).forEach((group, i, all) => {
    const s = p.addSlide();
    head(s, `Sources${all.length > 1 ? ` (${i + 1}/${all.length})` : ""}`);
    s.addText(
      group.flatMap((x) => [
        { text: `[${x.n}] ${clip(x.label, 110)}`, options: { breakLine: true, bold: true } },
        { text: clip(x.url, 130), options: { breakLine: true, color: THREAD, fontSize: 12, hyperlink: { url: x.url }, paraSpaceAfter: 8 } },
      ]),
      { x: 0.6, y: 1.4, w: 12.1, h: 5.4, fontFace: font, fontSize: 15, color: INK, valign: "top", fit: "shrink" },
    );
  });
  if (!src.length) {
    const s = p.addSlide();
    head(s, "Sources");
    s.addText("No web sources were cited.", { x: 0.6, y: 1.4, w: 12.1, h: 1, fontFace: font, fontSize: 18, color: INK });
  }
  return (await p.write({ outputType: "blob" })) as Blob;
}

/* ---------- PDF ---------- */
const SUBST: Record<string, string> = {
  "\u2192": "->", "\u2190": "<-", "\u2264": "<=", "\u2265": ">=", "\u2260": "!=", "\u2248": "~", "\u2212": "-",
  "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2015": "-", "\u2032": "'", "\u2033": '"', "\u00a0": " ", "\u202f": " ",
  "\u2009": " ", "\u200a": " ", "\u2007": " ", "\u2002": " ", "\u2003": " ", "\u200b": "", "\u2060": "", "\ufeff": "", "\u2713": "v", "\u2717": "x", "\u00ad": "",
};

async function renderPdf(m: ExportModel): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(m.title);
  pdf.setCreator("Ariadne");
  pdf.setProducer("Ariadne");
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ital = await pdf.embedFont(StandardFonts.HelveticaOblique);
  // Standard fonts use WinAnsi: French accents, curly quotes, dashes and € are fine.
  const ok = new Map<string, boolean>();
  const safe = (s: string): string =>
    Array.from(s.normalize("NFC"))
      .map((ch): string => {
        if (ch in SUBST) return SUBST[ch];
        if (ch === "\n" || ch === "\t") return " ";
        let good = ok.get(ch);
        if (good === undefined) {
          try {
            reg.encodeText(ch);
            good = true;
          } catch {
            good = false;
          }
          ok.set(ch, good);
        }
        if (good) return ch;
        const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return base && base !== ch && base.length === 1 ? safe(base) : "?";
      })
      .join("");

  const W = 595.28, Hh = 841.89, M = 56, CW = W - 2 * M;
  let page = pdf.addPage([W, Hh]);
  let y = Hh - M;
  const ink = rgb(0.12, 0.137, 0.157), dim = rgb(0.36, 0.38, 0.42), thread = rgb(0.54, 0.35, 0.12);
  const newPage = () => {
    page = pdf.addPage([W, Hh]);
    y = Hh - M;
  };
  type Tok = { text: string; font: typeof reg; color?: ReturnType<typeof rgb> };

  /** Wraps runs into the column, breaking words that are wider than a line (URLs). */
  function write(runs: { text: string; font: typeof reg; color?: ReturnType<typeof rgb> }[], size: number, opts: { indent?: number; hang?: string; gap?: number; lead?: number } = {}) {
    const indent = opts.indent ?? 0;
    const lead = opts.lead ?? size * 1.4;
    const width = CW - indent;
    const toks: Tok[] = [];
    for (const r of runs) for (const part of safe(r.text).split(/(\s+)/)) if (part) toks.push({ text: part, font: r.font, color: r.color });
    const lines: Tok[][] = [[]];
    let w = 0;
    const push = (t: Tok) => {
      const tw = t.font.widthOfTextAtSize(t.text, size);
      if (/^\s+$/.test(t.text)) {
        if (w === 0) return;
        lines[lines.length - 1].push({ ...t, text: " " });
        w += t.font.widthOfTextAtSize(" ", size);
        return;
      }
      if (w + tw > width && w > 0) {
        const cur = lines[lines.length - 1];
        while (cur.length && /^\s+$/.test(cur[cur.length - 1].text)) cur.pop();
        lines.push([]);
        w = 0;
      }
      if (tw > width) {
        let piece = "";
        for (const ch of t.text) {
          if (t.font.widthOfTextAtSize(piece + ch, size) > width - w) {
            lines[lines.length - 1].push({ ...t, text: piece });
            lines.push([]);
            w = 0;
            piece = "";
          }
          piece += ch;
        }
        lines[lines.length - 1].push({ ...t, text: piece });
        w += t.font.widthOfTextAtSize(piece, size);
        return;
      }
      lines[lines.length - 1].push(t);
      w += tw;
    };
    toks.forEach(push);
    lines.forEach((line, i) => {
      if (y - lead < M) newPage();
      y -= lead;
      if (i === 0 && opts.hang) page.drawText(safe(opts.hang), { x: M + indent - 12, y, size, font: reg, color: dim });
      let x = M + indent;
      for (const t of line) {
        page.drawText(t.text, { x, y, size, font: t.font, color: t.color ?? ink });
        x += t.font.widthOfTextAtSize(t.text, size);
      }
    });
    y -= opts.gap ?? 0;
  }
  const R = (rs: Run[]) => rs.map((r) => ({ text: r.text, font: r.bold ? bold : reg }));
  const heading = (text: string, size: number) => {
    if (y - size * 3 < M) newPage();
    y -= size * 0.6;
    write([{ text, font: bold }], size, { gap: 4 });
  };

  write([{ text: m.title, font: bold }], 22, { lead: 28, gap: 4 });
  write([{ text: meta(m), font: reg, color: dim }], 9.5, { gap: 10 });
  page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + 60, y: y + 4 }, thickness: 1.5, color: thread });
  y -= 6;
  for (const b of m.blocks) {
    if (b.kind === "heading") heading(b.text, b.level === 1 ? 15 : b.level === 2 ? 13 : 11.5);
    else if (b.kind === "para") write(R(b.runs), 10.5, { gap: 6 });
    else write(R(b.runs), 10.5, { indent: 14 + b.depth * 14, hang: b.ordered ? `${b.ordered}.` : "•", gap: 2 });
  }
  heading("Sources", 15);
  if (!m.sources.length) write([{ text: "No web sources were cited.", font: reg }], 10.5);
  for (const s of m.sources) write([{ text: `${s.label}. `, font: reg }, { text: s.url, font: reg, color: thread }], 9.5, { indent: 22, hang: `[${s.n}]`, gap: 3 });
  heading("Fact-check summary", 15);
  write([{ text: factCheckLine(m), font: reg }], 10.5, { gap: 6 });
  for (const c of m.claims) {
    write([{ text: `${c.verdict} · ${c.decision}`, font: bold, color: c.verdict === "Matches the source" ? dim : thread }], 9.5, { lead: 13 });
    write([{ text: c.claim, font: reg }], 10, { indent: 10 });
    if (c.note) write([{ text: c.note, font: ital, color: dim }], 9.5, { indent: 10 });
    y -= 6;
  }
  y -= 6;
  write([{ text: DISCLAIMER, font: ital, color: dim }], 9);
  const pages = pdf.getPages();
  pages.forEach((pg, i) => pg.drawText(safe(`Ariadne · ${m.title.slice(0, 70)} · ${i + 1}/${pages.length}`), { x: M, y: 28, size: 8, font: reg, color: dim }));
  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
