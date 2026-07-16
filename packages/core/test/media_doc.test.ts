import { describe, it, expect } from 'vitest';
import {
  createPDFLayoutDesign,
  parsePDFLayoutPrompt,
  validatePDFLayoutSpec,
  compilePDF,
  extractPDFData,
  generatePPTOutline,
  parsePPTOutlinePrompt,
  validatePPTOutline,
  buildPPTDeck,
  getThemeByName,
  createPPTTheme,
  listAvailableThemes,
  ModernCorporateTheme
} from '../src/index.js';

describe('PDF & PPT Media Document Suite (Steps 049 - 054)', () => {
  describe('Step 049: AI LLM PDF Layout Designer', () => {
    it('rejects a malformed spec with a clear error (not an opaque TypeError)', async () => {
      await expect(compilePDF(undefined as unknown as Parameters<typeof compilePDF>[0]))
        .rejects.toThrow(/PDFLayoutSpec object is required/i);
      await expect(
        compilePDF({ title: 'x', pageSize: 'A4', orientation: 'portrait' } as unknown as Parameters<typeof compilePDF>[0])
      ).rejects.toThrow(/spec\.sections must be a non-empty array/i);
    });

    it('should create default PDF layout design', () => {
      const spec = createPDFLayoutDesign({ title: 'Quarterly Report' });
      expect(spec.title).toBe('Quarterly Report');
      expect(spec.pageSize).toBe('A4');
      expect(spec.palette.primary).toBe('#1e3a8a');
    });

    it('should parse PDF layout prompt into structured spec', () => {
      const prompt = `# Financial Summary\nThis is an introduction paragraph.\n- Bullet point 1\n- Bullet point 2`;
      const spec = parsePDFLayoutPrompt(prompt, 'Financial Summary');
      expect(spec.title).toBe('Financial Summary');
      expect(spec.sections.length).toBe(1);
      expect(spec.sections[0].elements.length).toBeGreaterThan(0);
    });

    it('should validate PDF layout specs correctly', () => {
      const validSpec = createPDFLayoutDesign({ title: 'Valid Title' });
      const validRes = validatePDFLayoutSpec(validSpec);
      expect(validRes.valid).toBe(true);

      const invalidSpec = { ...validSpec, title: '' };
      const invalidRes = validatePDFLayoutSpec(invalidSpec);
      expect(invalidRes.valid).toBe(false);
      expect(invalidRes.errors).toContain('Document title is required.');
    });
  });

  describe('Step 050: Programmatic PDF Compiler Engine', () => {
    it('should compile PDF layout spec into binary Uint8Array', async () => {
      const spec = createPDFLayoutDesign({
        title: 'Compiled Test PDF',
        sections: [
          {
            title: 'Section 1',
            elements: [
              { type: 'heading', level: 1, text: 'Hello Compiler' },
              { type: 'paragraph', text: 'This is a test paragraph rendered into PDF binary.' },
              { type: 'table', headers: ['Name', 'Role'], rows: [['Alice', 'Engineer'], ['Bob', 'Designer']] }
            ]
          }
        ]
      });

      const pdfBytes = await compilePDF(spec);
      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(500);
    });
  });

  describe('Step 051: PDF Text & Table Extractor', () => {
    it('should extract metadata and text content from compiled PDF', async () => {
      const spec = createPDFLayoutDesign({
        title: 'Extractor Target Doc',
        author: 'Test Suite Author',
        sections: [
          {
            elements: [
              { type: 'heading', level: 1, text: 'Extraction Test Header' },
              { type: 'paragraph', text: 'Extracted text verifying engine capability.' }
            ]
          }
        ]
      });

      const pdfBytes = await compilePDF(spec);
      const result = await extractPDFData(pdfBytes);

      expect(result.metadata.title).toBe('Extractor Target Doc');
      expect(result.metadata.author).toBe('Test Suite Author');
      expect(result.metadata.pageCount).toBe(1);
      expect(result.fullText).toContain('Extraction Test Header');
      expect(result.fullText).toContain('Extracted text verifying engine capability.');
    });
  });

  describe('Step 052: AI Presentation Deck Outline Generator', () => {
    it('should generate structured PPT deck outline', () => {
      const deck = generatePPTOutline({ topic: 'AI in Cloud Computing', slideCount: 5 });
      expect(deck.topic).toBe('AI in Cloud Computing');
      expect(deck.totalSlides).toBe(5);
      expect(deck.slides[0].layoutType).toBe('title');
    });

    it('should parse PPT outline prompt into structured deck outline', () => {
      const prompt = `Future of Quantum Computing\n- Qubit Stability\n- Error Correction`;
      const deck = parsePPTOutlinePrompt(prompt, 5);
      expect(deck.topic).toBe('Future of Quantum Computing');
      expect(deck.slides.length).toBe(5);
    });

    it('should validate PPT deck outline correctly', () => {
      const deck = generatePPTOutline({ topic: 'Validation Test' });
      const validRes = validatePPTOutline(deck);
      expect(validRes.valid).toBe(true);

      const invalidRes = validatePPTOutline({ ...deck, title: '' });
      expect(invalidRes.valid).toBe(false);
    });
  });

  describe('Step 053: Programmatic PPT Builder Engine', () => {
    it('should build PPT presentation buffer from deck outline', async () => {
      const deck = generatePPTOutline({ topic: 'Automated PPT Engine Test', slideCount: 5 });
      const pptBuffer = await buildPPTDeck(deck);
      expect(pptBuffer).toBeInstanceOf(Buffer);
      expect(pptBuffer.length).toBeGreaterThan(1000);
    });
  });

  describe('Step 054: Custom PPT Brand & Theme Stylizer', () => {
    it('should fetch standard theme by name', () => {
      const theme = getThemeByName('modern-corporate');
      expect(theme.name).toBe('modern-corporate');
      expect(theme.palette.primary).toBe(ModernCorporateTheme.palette.primary);
    });

    it('should create custom PPT brand theme', () => {
      const customTheme = createPPTTheme({
        name: 'brand-blue',
        displayName: 'Brand Blue',
        palette: { primary: '0A2540', secondary: '635BFF' }
      });
      expect(customTheme.name).toBe('brand-blue');
      expect(customTheme.palette.primary).toBe('0A2540');

      const fetched = getThemeByName('brand-blue');
      expect(fetched.displayName).toBe('Brand Blue');
    });

    it('should list available themes including registered custom ones', () => {
      const themes = listAvailableThemes();
      expect(themes.length).toBeGreaterThanOrEqual(4);
    });
  });
});
