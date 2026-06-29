import { PDFDocument } from 'pdf-lib';
import * as zlib from 'zlib';

export interface PDFExtractedTable {
  headers: string[];
  rows: string[][];
}

export interface PDFPageContent {
  pageNumber: number;
  text: string;
  lines: string[];
  tables: PDFExtractedTable[];
}

export interface PDFExtractionResult {
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    producer?: string;
    pageCount: number;
  };
  fullText: string;
  pages: PDFPageContent[];
}

function parseStreamText(streamStr: string): string[] {
  const extractedLines: string[] = [];
  // Match BT ... ET blocks or standalone text operations
  const btBlockRegex = /BT([\s\S]*?)ET/g;
  let blockMatch: RegExpExecArray | null;

  const extractStringFromOp = (str: string): string => {
    // Hex string <...>
    if (str.startsWith('<') && str.endsWith('>')) {
      const hex = str.slice(1, -1);
      try {
        return Buffer.from(hex, 'hex').toString('utf-8');
      } catch {
        return '';
      }
    }
    // Literal string (...)
    if (str.startsWith('(') && str.endsWith(')')) {
      return str.slice(1, -1).replace(/\\([()])/g, '$1');
    }
    return '';
  };

  while ((blockMatch = btBlockRegex.exec(streamStr)) !== null) {
    const blockContent = blockMatch[1];
    let currentLineText = '';

    // Match Tj operators: (<hex|str>) Tj
    const tjRegex = /(<[0-9a-fA-F]+>|\([\s\S]*?\))\s*Tj/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(blockContent)) !== null) {
      const parsed = extractStringFromOp(tjMatch[1]);
      if (parsed) {
        currentLineText += (currentLineText ? ' ' : '') + parsed;
      }
    }

    // Match TJ operators: [(...) 10 <...>] TJ
    const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
    let tjArrayMatch: RegExpExecArray | null;
    while ((tjArrayMatch = tjArrayRegex.exec(blockContent)) !== null) {
      const itemsStr = tjArrayMatch[1];
      const itemRegex = /(<[0-9a-fA-F]+>|\([\s\S]*?\))/g;
      let itemMatch: RegExpExecArray | null;
      let tjText = '';
      while ((itemMatch = itemRegex.exec(itemsStr)) !== null) {
        tjText += extractStringFromOp(itemMatch[1]);
      }
      if (tjText) {
        currentLineText += (currentLineText ? ' ' : '') + tjText;
      }
    }

    if (currentLineText.trim()) {
      extractedLines.push(currentLineText.trim());
    }
  }

  // Fallback if BT/ET blocks were not matched properly
  if (extractedLines.length === 0) {
    const fallbackRegex = /(<[0-9a-fA-F]+>|\([\s\S]*?\))\s*Tj/g;
    let fbMatch: RegExpExecArray | null;
    while ((fbMatch = fallbackRegex.exec(streamStr)) !== null) {
      const hex = fbMatch[1];
      if (hex.startsWith('<') && hex.endsWith('>')) {
        try {
          const txt = Buffer.from(hex.slice(1, -1), 'hex').toString('utf-8').trim();
          if (txt) extractedLines.push(txt);
        } catch {}
      }
    }
  }

  return extractedLines;
}

function extractTablesFromLines(lines: string[]): PDFExtractedTable[] {
  const tables: PDFExtractedTable[] = [];
  let currentTable: { headers: string[]; rows: string[][] } | null = null;

  for (const line of lines) {
    // Check if line contains pipe dividers or tab/multiple spaces separation indicative of tables
    if (line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim()).filter((p) => p.length > 0);
      if (parts.length >= 2) {
        if (!currentTable) {
          currentTable = { headers: parts, rows: [] };
        } else {
          currentTable.rows.push(parts);
        }
        continue;
      }
    }

    if (currentTable) {
      tables.push(currentTable);
      currentTable = null;
    }
  }

  if (currentTable) {
    tables.push(currentTable);
  }

  return tables;
}

export async function extractPDFData(pdfBuffer: Uint8Array | Buffer): Promise<PDFExtractionResult> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false });

  const metadata = {
    title: pdfDoc.getTitle(),
    author: pdfDoc.getAuthor(),
    subject: pdfDoc.getSubject(),
    producer: pdfDoc.getProducer(),
    pageCount: pdfDoc.getPageCount()
  };

  const pages: PDFPageContent[] = [];
  const allPages = pdfDoc.getPages();

  for (let i = 0; i < allPages.length; i++) {
    const page = allPages[i];
    const contents = page.node.Contents();
    let fullStreamStr = '';

    if (contents) {
      // Contents can be a single PDFRef or a PDFArray of refs
      const refs = (contents as any).array ? (contents as any).array : [contents];
      for (const ref of refs) {
        try {
          const streamObj = pdfDoc.context.lookup(ref) as any;
          if (streamObj && typeof streamObj.getContents === 'function') {
            const rawBytes = streamObj.getContents();
            try {
              fullStreamStr += zlib.inflateSync(Buffer.from(rawBytes)).toString('utf-8');
            } catch {
              try {
                fullStreamStr += zlib.unzipSync(Buffer.from(rawBytes)).toString('utf-8');
              } catch {
                fullStreamStr += Buffer.from(rawBytes).toString('utf-8');
              }
            }
          }
        } catch {}
      }
    }

    const lines = parseStreamText(fullStreamStr);
    const tables = extractTablesFromLines(lines);

    pages.push({
      pageNumber: i + 1,
      text: lines.join('\n'),
      lines,
      tables
    });
  }

  const fullText = pages.map((p) => p.text).join('\n\n');

  return {
    metadata,
    fullText,
    pages
  };
}
