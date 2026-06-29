import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, RGB } from 'pdf-lib';
import { PDFLayoutSpec, PDFElement, PDFPageSize, PDFPageOrientation } from './pdf_designer.js';

function hexToRGB(hex: string): RGB {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return rgb(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b);
}

function getPageDimensions(size: PDFPageSize, orientation: PDFPageOrientation): [number, number] {
  let width = 595.28;
  let height = 841.89;

  if (size === 'LETTER') {
    width = 612;
    height = 792;
  } else if (size === 'LEGAL') {
    width = 612;
    height = 1008;
  }

  if (orientation === 'landscape') {
    return [height, width];
  }
  return [width, height];
}

export async function compilePDF(spec: PDFLayoutSpec): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(spec.title);
  if (spec.author) pdfDoc.setAuthor(spec.author);
  if (spec.subject) pdfDoc.setSubject(spec.subject);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fontBoldOblique = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

  const [pageWidth, pageHeight] = getPageDimensions(spec.pageSize, spec.orientation);
  const { top, bottom, left, right } = spec.margins;
  const printableWidth = pageWidth - left - right;

  const pages: PDFPage[] = [];

  const createNewPage = (): { page: PDFPage; currentY: number } => {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    pages.push(page);
    return { page, currentY: pageHeight - top };
  };

  let { page: currentPage, currentY } = createNewPage();

  const ensureSpace = (neededHeight: number): void => {
    if (currentY - neededHeight < bottom) {
      const result = createNewPage();
      currentPage = result.page;
      currentY = result.currentY;
    }
  };

  const primaryColor = hexToRGB(spec.palette.primary);
  const secondaryColor = hexToRGB(spec.palette.secondary);
  const textColor = hexToRGB(spec.palette.text);

  for (const section of spec.sections) {
    if (section.title) {
      ensureSpace(40);
      currentPage.drawText(section.title, {
        x: left,
        y: currentY - 20,
        size: 18,
        font: fontBold,
        color: primaryColor
      });
      currentY -= 35;
    }

    for (const element of section.elements) {
      switch (element.type) {
        case 'heading': {
          const fontSize = element.level === 1 ? 22 : element.level === 2 ? 16 : 14;
          const font = element.level === 1 ? fontBold : fontRegular;
          const color = element.color ? hexToRGB(element.color) : element.level === 1 ? primaryColor : secondaryColor;
          ensureSpace(fontSize + 15);
          currentPage.drawText(element.text, {
            x: left,
            y: currentY - fontSize,
            size: fontSize,
            font,
            color
          });
          currentY -= fontSize + 15;
          break;
        }

        case 'paragraph': {
          const fontSize = element.fontSize || 11;
          let font = fontRegular;
          if (element.fontStyle === 'bold') font = fontBold;
          if (element.fontStyle === 'italic') font = fontOblique;
          if (element.fontStyle === 'bold-italic') font = fontBoldOblique;

          const color = element.color ? hexToRGB(element.color) : textColor;
          const words = element.text.split(' ');
          let currentLine = '';

          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const testWidth = font.widthOfTextAtSize(testLine, fontSize);
            if (testWidth > printableWidth && currentLine !== '') {
              ensureSpace(fontSize + 4);
              currentPage.drawText(currentLine, {
                x: left,
                y: currentY - fontSize,
                size: fontSize,
                font,
                color
              });
              currentY -= fontSize + 4;
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine !== '') {
            ensureSpace(fontSize + 4);
            currentPage.drawText(currentLine, {
              x: left,
              y: currentY - fontSize,
              size: fontSize,
              font,
              color
            });
            currentY -= fontSize + 8;
          }
          break;
        }

        case 'bullet_list': {
          const fontSize = element.fontSize || 11;
          const color = element.color ? hexToRGB(element.color) : textColor;
          for (const item of element.items) {
            ensureSpace(fontSize + 4);
            currentPage.drawText(`• ${item}`, {
              x: left + 10,
              y: currentY - fontSize,
              size: fontSize,
              font: fontRegular,
              color
            });
            currentY -= fontSize + 4;
          }
          currentY -= 6;
          break;
        }

        case 'table': {
          const headers = element.headers;
          const rows = element.rows;
          const colCount = headers.length || 1;
          const defaultColWidth = printableWidth / colCount;
          const colWidths = element.colWidths || headers.map(() => defaultColWidth);
          const rowHeight = 22;
          const fontSize = 10;
          const headerBg = element.headerBg ? hexToRGB(element.headerBg) : primaryColor;

          ensureSpace(rowHeight * (rows.length + 1) + 10);

          // Draw header
          let currentX = left;
          for (let c = 0; c < colCount; c++) {
            const w = colWidths[c] || defaultColWidth;
            currentPage.drawRectangle({
              x: currentX,
              y: currentY - rowHeight,
              width: w,
              height: rowHeight,
              color: headerBg
            });
            const text = headers[c] || '';
            currentPage.drawText(text, {
              x: currentX + 5,
              y: currentY - rowHeight + 6,
              size: fontSize,
              font: fontBold,
              color: rgb(1, 1, 1)
            });
            currentX += w;
          }
          currentY -= rowHeight;

          // Draw rows
          for (let r = 0; r < rows.length; r++) {
            ensureSpace(rowHeight);
            currentX = left;
            const rowData = rows[r];
            const isStripe = element.stripeRows !== false && r % 2 === 1;
            const bg = isStripe ? rgb(0.95, 0.95, 0.95) : rgb(1, 1, 1);

            for (let c = 0; c < colCount; c++) {
              const w = colWidths[c] || defaultColWidth;
              currentPage.drawRectangle({
                x: currentX,
                y: currentY - rowHeight,
                width: w,
                height: rowHeight,
                color: bg,
                borderColor: rgb(0.8, 0.8, 0.8),
                borderWidth: 0.5
              });
              const text = rowData[c] || '';
              currentPage.drawText(text, {
                x: currentX + 5,
                y: currentY - rowHeight + 6,
                size: fontSize,
                font: fontRegular,
                color: textColor
              });
              currentX += w;
            }
            currentY -= rowHeight;
          }
          currentY -= 10;
          break;
        }

        case 'divider': {
          const thickness = element.thickness || 1;
          const color = element.color ? hexToRGB(element.color) : rgb(0.8, 0.8, 0.8);
          ensureSpace(thickness + 10);
          currentPage.drawLine({
            start: { x: left, y: currentY - 5 },
            end: { x: pageWidth - right, y: currentY - 5 },
            thickness,
            color
          });
          currentY -= thickness + 15;
          break;
        }

        case 'spacer': {
          currentY -= element.height;
          break;
        }
      }
    }
  }

  // Header & Footer rendering
  const totalPages = pages.length;
  for (let i = 0; i < totalPages; i++) {
    const p = pages[i];
    if (spec.headerFooter.headerText) {
      p.drawText(spec.headerFooter.headerText, {
        x: left,
        y: pageHeight - top + 15,
        size: 9,
        font: fontOblique,
        color: rgb(0.5, 0.5, 0.5)
      });
    }
    if (spec.headerFooter.showPageNumbers) {
      const footerStr = `${spec.headerFooter.footerText ? spec.headerFooter.footerText + ' | ' : ''}Page ${i + 1} of ${totalPages}`;
      p.drawText(footerStr, {
        x: left,
        y: bottom - 25,
        size: 9,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.5)
      });
    }
  }

  return await pdfDoc.save();
}
