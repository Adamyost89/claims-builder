import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { ExportDocument } from "./format";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const LINE_HEIGHT = 14;

function wrapText(text: string, maxWidth: number, font: Awaited<ReturnType<PDFDocument["embedFont"]>>) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, 11);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

export async function buildPdfBuffer(document: ExportDocument): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = PAGE_HEIGHT - MARGIN;
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  function ensureSpace(linesNeeded: number) {
    if (y - linesNeeded * LINE_HEIGHT < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawLine(text: string, size = 11, font = regular, color = rgb(0, 0, 0)) {
    ensureSpace(1);
    page.drawText(text, { x: MARGIN, y, size, font, color });
    y -= LINE_HEIGHT + 2;
  }

  function drawWrapped(text: string, size = 11, font = regular) {
    for (const line of wrapText(text, maxWidth, font)) {
      drawLine(line, size, font);
    }
  }

  if (document.watermark) {
    drawLine(document.watermark, 12, bold, rgb(0.8, 0, 0));
    y -= 4;
  }

  drawLine(document.customerName, 16, bold);
  drawLine(
    `Claim: ${document.claimNumber}  |  Mode: ${document.outputMode.replaceAll("_", " ")}`,
    10,
    regular,
    rgb(0.3, 0.3, 0.3),
  );
  y -= 6;
  drawLine(document.title, 14, bold);

  for (const section of document.sections) {
    y -= 4;
    drawLine(section.heading, 12, bold);
    drawWrapped(section.body);
    y -= 4;
  }

  if (document.appendix) {
    y -= 4;
    drawLine("Appendix", 12, bold);
    drawWrapped(document.appendix);
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
