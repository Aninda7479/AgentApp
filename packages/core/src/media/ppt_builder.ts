import pptxgen from 'pptxgenjs';
import { PPTDeckOutline, PPTSlideOutline } from './ppt_outline.js';
import { PPTTheme, getThemeByName } from './ppt_stylizer.js';

export async function buildPPTDeck(deck: PPTDeckOutline, customTheme?: PPTTheme): Promise<Buffer> {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  pres.title = deck.title;
  if (deck.topic) pres.subject = deck.topic;

  const theme = customTheme || getThemeByName(deck.themePreference);

  for (const slideData of deck.slides) {
    const slide = pres.addSlide();
    slide.background = { color: theme.palette.background };

    if (slideData.speakerNotes) {
      slide.addNotes(slideData.speakerNotes);
    }

    switch (slideData.layoutType) {
      case 'title':
        renderTitleSlide(pres, slide, slideData, theme);
        break;
      case 'two-column':
        renderTwoColumnSlide(pres, slide, slideData, theme);
        break;
      case 'stats':
        renderStatsSlide(pres, slide, slideData, theme);
        break;
      case 'quote':
        renderQuoteSlide(pres, slide, slideData, theme);
        break;
      case 'content':
      case 'summary':
      default:
        renderContentSlide(pres, slide, slideData, theme);
        break;
    }
  }

  const result = await pres.write({ outputType: 'nodebuffer' });
  return result as Buffer;
}

function renderTitleSlide(pres: any, slide: any, slideData: PPTSlideOutline, theme: PPTTheme) {
  // Decorative accent shape
  slide.addShape(pres.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.4,
    h: 5.625,
    fill: { color: theme.palette.secondary }
  });

  slide.addText(slideData.title, {
    x: 1.0,
    y: 1.8,
    w: 8.2,
    h: 1.5,
    fontSize: 36,
    bold: true,
    color: theme.palette.primary,
    fontFace: theme.fontHeader
  });

  if (slideData.subtitle) {
    slide.addText(slideData.subtitle, {
      x: 1.0,
      y: 3.3,
      w: 8.2,
      h: 1.0,
      fontSize: 20,
      color: theme.palette.mutedText,
      fontFace: theme.fontBody
    });
  }
}

function renderContentSlide(pres: any, slide: any, slideData: PPTSlideOutline, theme: PPTTheme) {
  slide.addText(slideData.title, {
    x: 0.8,
    y: 0.5,
    w: 8.4,
    h: 0.8,
    fontSize: 28,
    bold: true,
    color: theme.palette.primary,
    fontFace: theme.fontHeader
  });

  const bullets = slideData.bulletPoints || [];
  if (bullets.length > 0) {
    const textObjects = bullets.map((b) => ({
      text: b,
      options: { bullet: true, color: theme.palette.text, fontSize: 16, fontFace: theme.fontBody, breakLine: true }
    }));

    slide.addText(textObjects, {
      x: 0.8,
      y: 1.5,
      w: 8.4,
      h: 3.6,
      paraSpaceAfter: 12
    });
  }
}

function renderTwoColumnSlide(pres: any, slide: any, slideData: PPTSlideOutline, theme: PPTTheme) {
  slide.addText(slideData.title, {
    x: 0.8,
    y: 0.5,
    w: 8.4,
    h: 0.8,
    fontSize: 28,
    bold: true,
    color: theme.palette.primary,
    fontFace: theme.fontHeader
  });

  const leftItems = slideData.leftColumn || [];
  if (leftItems.length > 0) {
    const leftTexts = leftItems.map((b) => ({
      text: b,
      options: { bullet: true, color: theme.palette.text, fontSize: 15, fontFace: theme.fontBody, breakLine: true }
    }));
    slide.addText(leftTexts, {
      x: 0.8,
      y: 1.5,
      w: 4.0,
      h: 3.6,
      paraSpaceAfter: 10
    });
  }

  const rightItems = slideData.rightColumn || [];
  if (rightItems.length > 0) {
    const rightTexts = rightItems.map((b) => ({
      text: b,
      options: { bullet: true, color: theme.palette.text, fontSize: 15, fontFace: theme.fontBody, breakLine: true }
    }));
    slide.addText(rightTexts, {
      x: 5.2,
      y: 1.5,
      w: 4.0,
      h: 3.6,
      paraSpaceAfter: 10
    });
  }
}

function renderStatsSlide(pres: any, slide: any, slideData: PPTSlideOutline, theme: PPTTheme) {
  slide.addText(slideData.title, {
    x: 0.8,
    y: 0.5,
    w: 8.4,
    h: 0.8,
    fontSize: 28,
    bold: true,
    color: theme.palette.primary,
    fontFace: theme.fontHeader
  });

  const stats = slideData.stats || [
    { number: '100%', label: 'Metric 1' },
    { number: '2.5x', label: 'Metric 2' },
    { number: '+50%', label: 'Metric 3' }
  ];

  const cardWidth = 2.6;
  const startX = 0.8;
  const gap = 0.3;

  stats.forEach((st, idx) => {
    const posX = startX + idx * (cardWidth + gap);
    slide.addShape(pres.ShapeType.rect, {
      x: posX,
      y: 1.8,
      w: cardWidth,
      h: 2.5,
      fill: { color: theme.palette.cardBg },
      line: { color: theme.palette.secondary, width: 1 }
    });

    slide.addText(st.number, {
      x: posX,
      y: 2.1,
      w: cardWidth,
      h: 0.8,
      fontSize: 32,
      bold: true,
      align: 'center',
      color: theme.palette.secondary,
      fontFace: theme.fontHeader
    });

    slide.addText(st.label, {
      x: posX + 0.1,
      y: 3.0,
      w: cardWidth - 0.2,
      h: 0.8,
      fontSize: 14,
      align: 'center',
      color: theme.palette.mutedText,
      fontFace: theme.fontBody
    });
  });
}

function renderQuoteSlide(pres: any, slide: any, slideData: PPTSlideOutline, theme: PPTTheme) {
  slide.addText(slideData.title, {
    x: 0.8,
    y: 0.5,
    w: 8.4,
    h: 0.8,
    fontSize: 28,
    bold: true,
    color: theme.palette.primary,
    fontFace: theme.fontHeader
  });

  const quoteText = slideData.quote?.text || 'Innovation distinguishes between a leader and a follower.';
  const author = slideData.quote?.author || 'Steve Jobs';

  slide.addText(`"${quoteText}"`, {
    x: 1.5,
    y: 2.0,
    w: 7.0,
    h: 1.8,
    fontSize: 22,
    italic: true,
    align: 'center',
    color: theme.palette.text,
    fontFace: theme.fontBody
  });

  slide.addText(`— ${author}`, {
    x: 1.5,
    y: 3.9,
    w: 7.0,
    h: 0.6,
    fontSize: 16,
    bold: true,
    align: 'center',
    color: theme.palette.secondary,
    fontFace: theme.fontHeader
  });
}
