export type PPTSlideLayoutType = 'title' | 'content' | 'two-column' | 'quote' | 'stats' | 'summary';

export interface PPTSlideOutline {
  slideNumber: number;
  title: string;
  subtitle?: string;
  layoutType: PPTSlideLayoutType;
  bulletPoints?: string[];
  leftColumn?: string[];
  rightColumn?: string[];
  quote?: { text: string; author?: string };
  stats?: { number: string; label: string }[];
  speakerNotes?: string;
}

export interface PPTDeckOutline {
  title: string;
  subtitle?: string;
  topic: string;
  totalSlides: number;
  themePreference?: string;
  slides: PPTSlideOutline[];
}

export interface PPTOutlineOptions {
  topic: string;
  targetAudience?: string;
  slideCount?: number;
  themePreference?: string;
  keyTakeaways?: string[];
}

export function generatePPTOutline(options: PPTOutlineOptions): PPTDeckOutline {
  const count = options.slideCount || 5;
  const topic = options.topic || 'General Presentation';
  const slides: PPTSlideOutline[] = [];

  // Slide 1: Title Slide
  slides.push({
    slideNumber: 1,
    title: topic,
    subtitle: options.targetAudience ? `Prepared for ${options.targetAudience}` : 'Comprehensive Strategy & Insights',
    layoutType: 'title',
    speakerNotes: 'Welcome the audience and introduce the core subject.'
  });

  // Slide 2: Overview / Agenda
  slides.push({
    slideNumber: 2,
    title: 'Executive Overview',
    layoutType: 'content',
    bulletPoints: [
      `Introduction to ${topic}`,
      'Key objectives and market drivers',
      'Strategic core pillars and implementation',
      'Expected outcomes and metrics'
    ],
    speakerNotes: 'Outline what will be covered during this session.'
  });

  // Slide 3: Detailed Content / Stats
  slides.push({
    slideNumber: 3,
    title: 'Impact & Key Statistics',
    layoutType: 'stats',
    stats: [
      { number: '+85%', label: 'Efficiency Improvement' },
      { number: '3.5x', label: 'ROI Growth Rate' },
      { number: '100%', label: 'Automated Operations' }
    ],
    speakerNotes: 'Highlight key data points driving our strategy.'
  });

  // Slide 4: Comparison / Details
  if (count >= 4) {
    slides.push({
      slideNumber: 4,
      title: 'Current vs. Proposed Approach',
      layoutType: 'two-column',
      leftColumn: ['Manual Workflows', 'Siloed Systems', 'High Friction Costs'],
      rightColumn: ['AI-Driven Automation', 'Unified Architecture', 'Optimized Throughput'],
      speakerNotes: 'Contrast legacy bottlenecks with the proposed modern model.'
    });
  }

  // Slide 5+: Summary or Takeaways
  if (count >= 5) {
    slides.push({
      slideNumber: 5,
      title: 'Summary & Key Takeaways',
      layoutType: 'summary',
      bulletPoints: options.keyTakeaways || [
        'Adopt automated solutions for immediate scalability.',
        'Leverage data-driven decision making across teams.',
        'Next steps: Initiate rollout and milestone evaluation.'
      ],
      speakerNotes: 'Conclude with clear action items and open up for Q&A.'
    });
  }

  // Fill remaining slides if requested count > 5
  while (slides.length < count) {
    const num = slides.length + 1;
    slides.push({
      slideNumber: num,
      title: `Deep Dive: Section ${num - 4}`,
      layoutType: 'content',
      bulletPoints: [`Core pillar focus point ${num}.1`, `Operational tactic ${num}.2`, `Execution milestone ${num}.3`],
      speakerNotes: `Elaborate on section ${num - 4} details.`
    });
  }

  return {
    title: topic,
    subtitle: options.targetAudience ? `Audience: ${options.targetAudience}` : undefined,
    topic,
    totalSlides: slides.length,
    themePreference: options.themePreference || 'modern-corporate',
    slides
  };
}

export function parsePPTOutlinePrompt(prompt: string, slideCount?: number): PPTDeckOutline {
  const lines = prompt.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const topic = lines[0] || 'AI Presentation Deck';
  const takeaways: string[] = lines.slice(1).filter((l) => l.startsWith('- ') || l.startsWith('* ')).map((l) => l.replace(/^[-*]\s*/, ''));

  return generatePPTOutline({
    topic,
    slideCount: slideCount || 5,
    keyTakeaways: takeaways.length > 0 ? takeaways : undefined
  });
}

export function validatePPTOutline(deck: PPTDeckOutline): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!deck.title || deck.title.trim() === '') {
    errors.push('Presentation title is required.');
  }
  if (!deck.topic || deck.topic.trim() === '') {
    errors.push('Topic is required.');
  }
  if (!deck.slides || !Array.isArray(deck.slides) || deck.slides.length === 0) {
    errors.push('Deck must contain at least one slide.');
  } else {
    deck.slides.forEach((s, idx) => {
      if (!s.title) {
        errors.push(`Slide ${idx + 1} is missing a title.`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
