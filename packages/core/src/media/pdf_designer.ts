export type PDFPageSize = 'A4' | 'LETTER' | 'LEGAL';
export type PDFPageOrientation = 'portrait' | 'landscape';
export type PDFAlignment = 'left' | 'center' | 'right';
export type PDFFontStyle = 'normal' | 'bold' | 'italic' | 'bold-italic';

export interface PDFMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PDFColorPalette {
  primary: string;
  secondary: string;
  text: string;
  background: string;
  accent: string;
}

export interface PDFHeaderFooterOptions {
  showPageNumbers?: boolean;
  headerText?: string;
  footerText?: string;
}

export interface PDFHeadingElement {
  type: 'heading';
  level: 1 | 2 | 3;
  text: string;
  color?: string;
  align?: PDFAlignment;
}

export interface PDFParagraphElement {
  type: 'paragraph';
  text: string;
  fontSize?: number;
  fontStyle?: PDFFontStyle;
  color?: string;
  align?: PDFAlignment;
}

export interface PDFBulletListElement {
  type: 'bullet_list';
  items: string[];
  fontSize?: number;
  color?: string;
}

export interface PDFTableElement {
  type: 'table';
  headers: string[];
  rows: string[][];
  colWidths?: number[];
  headerBg?: string;
  stripeRows?: boolean;
}

export interface PDFDividerElement {
  type: 'divider';
  thickness?: number;
  color?: string;
}

export interface PDFSpacerElement {
  type: 'spacer';
  height: number;
}

export type PDFElement =
  | PDFHeadingElement
  | PDFParagraphElement
  | PDFBulletListElement
  | PDFTableElement
  | PDFDividerElement
  | PDFSpacerElement;

export interface PDFSectionSpec {
  title?: string;
  elements: PDFElement[];
}

export interface PDFLayoutSpec {
  title: string;
  author?: string;
  subject?: string;
  pageSize: PDFPageSize;
  orientation: PDFPageOrientation;
  margins: PDFMargins;
  palette: PDFColorPalette;
  headerFooter: PDFHeaderFooterOptions;
  sections: PDFSectionSpec[];
}

export interface PDFDesignOptions {
  title: string;
  author?: string;
  subject?: string;
  pageSize?: PDFPageSize;
  orientation?: PDFPageOrientation;
  palette?: Partial<PDFColorPalette>;
  headerFooter?: PDFHeaderFooterOptions;
  sections?: PDFSectionSpec[];
}

export function createDefaultPDFPalette(): PDFColorPalette {
  return {
    primary: '#1e3a8a',
    secondary: '#3b82f6',
    text: '#1f2937',
    background: '#ffffff',
    accent: '#f59e0b'
  };
}

export function createPDFLayoutDesign(options: PDFDesignOptions): PDFLayoutSpec {
  const defaultPalette = createDefaultPDFPalette();
  return {
    title: options.title || 'Untitled Document',
    author: options.author || 'SuperAgent AI',
    subject: options.subject || 'Automated Document Generation',
    pageSize: options.pageSize || 'A4',
    orientation: options.orientation || 'portrait',
    margins: {
      top: 50,
      bottom: 50,
      left: 50,
      right: 50
    },
    palette: {
      ...defaultPalette,
      ...(options.palette || {})
    },
    headerFooter: {
      showPageNumbers: true,
      headerText: options.title || 'SuperAgent AI Generated PDF',
      footerText: 'Confidential',
      ...(options.headerFooter || {})
    },
    sections: options.sections || []
  };
}

export function parsePDFLayoutPrompt(prompt: string, title?: string): PDFLayoutSpec {
  const docTitle = title || prompt.slice(0, 40) || 'AI Generated Report';
  const lines = prompt.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  const elements: PDFElement[] = [];
  elements.push({
    type: 'heading',
    level: 1,
    text: docTitle
  });
  elements.push({
    type: 'divider',
    thickness: 2
  });

  const bulletItems: string[] = [];

  for (const line of lines) {
    if (line.startsWith('# ')) {
      elements.push({ type: 'heading', level: 1, text: line.replace('# ', '').trim() });
    } else if (line.startsWith('## ')) {
      elements.push({ type: 'heading', level: 2, text: line.replace('## ', '').trim() });
    } else if (line.startsWith('### ')) {
      elements.push({ type: 'heading', level: 3, text: line.replace('### ', '').trim() });
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      bulletItems.push(line.replace(/^[-*]\s*/, '').trim());
    } else {
      if (bulletItems.length > 0) {
        elements.push({ type: 'bullet_list', items: [...bulletItems] });
        bulletItems.length = 0;
      }
      elements.push({ type: 'paragraph', text: line });
    }
  }

  if (bulletItems.length > 0) {
    elements.push({ type: 'bullet_list', items: bulletItems });
  }

  return createPDFLayoutDesign({
    title: docTitle,
    sections: [{ title: 'Main Content', elements }]
  });
}

export function validatePDFLayoutSpec(spec: PDFLayoutSpec): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!spec.title || spec.title.trim() === '') {
    errors.push('Document title is required.');
  }
  if (!['A4', 'LETTER', 'LEGAL'].includes(spec.pageSize)) {
    errors.push(`Invalid page size: ${spec.pageSize}`);
  }
  if (!['portrait', 'landscape'].includes(spec.orientation)) {
    errors.push(`Invalid orientation: ${spec.orientation}`);
  }
  if (!spec.sections || !Array.isArray(spec.sections)) {
    errors.push('Sections must be an array.');
  } else {
    spec.sections.forEach((sec, sIdx) => {
      if (!sec.elements || !Array.isArray(sec.elements)) {
        errors.push(`Section ${sIdx} elements must be an array.`);
      }
    });
  }
  return {
    valid: errors.length === 0,
    errors
  };
}
