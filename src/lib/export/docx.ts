import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

import type { ExportDocument } from "./format";

export async function buildDocxBuffer(document: ExportDocument): Promise<Buffer> {
  const children: Paragraph[] = [];

  if (document.watermark) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: document.watermark,
            bold: true,
            color: "CC0000",
          }),
        ],
      }),
    );
  }

  children.push(
    new Paragraph({
      text: document.customerName,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Claim: ", bold: true }),
        new TextRun(document.claimNumber),
        new TextRun({ text: "  |  Mode: ", bold: true }),
        new TextRun(document.outputMode.replaceAll("_", " ")),
      ],
    }),
    new Paragraph({
      text: document.title,
      heading: HeadingLevel.HEADING_2,
    }),
  );

  for (const section of document.sections) {
    children.push(
      new Paragraph({
        text: section.heading,
        heading: HeadingLevel.HEADING_3,
      }),
      new Paragraph({
        text: section.body,
      }),
    );
  }

  if (document.appendix) {
    children.push(
      new Paragraph({
        text: "Appendix",
        heading: HeadingLevel.HEADING_3,
      }),
      new Paragraph({
        text: document.appendix,
      }),
    );
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
