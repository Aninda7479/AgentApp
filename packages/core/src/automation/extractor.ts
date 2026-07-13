import { Page } from 'playwright';

/** Content extracted from a web page, including Markdown and metadata. */
export interface ExtractedPageContent {
  url: string;
  title: string;
  markdown: string;
  textContent: string;
  metadata: Record<string, string>;
}

export class WebPageExtractor {
  /**
   * Extract content and convert to Markdown from a Playwright Page instance.
   */
  public async extractFromPage(page: Page): Promise<ExtractedPageContent> {
    const url = page.url();
    const html = await page.content();
    return this.extractFromHtml(html, url);
  }

  /**
   * Extract content and convert to Markdown from a raw HTML string.
   */
  public extractFromHtml(html: string, baseUrl: string = ''): ExtractedPageContent {
    const title = this.extractTitle(html);
    const metadata = this.extractMetadata(html);
    const cleanedHtml = this.cleanHtml(html);
    const markdown = this.convertHtmlToMarkdown(cleanedHtml);
    const textContent = this.stripMarkdown(markdown);

    return {
      url: baseUrl,
      title,
      markdown,
      textContent,
      metadata,
    };
  }

  private extractTitle(html: string): string {
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      return this.decodeEntities(titleMatch[1].trim());
    }
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogTitleMatch && ogTitleMatch[1]) {
      return this.decodeEntities(ogTitleMatch[1].trim());
    }
    return 'Untitled Page';
  }

  private extractMetadata(html: string): Record<string, string> {
    const metadata: Record<string, string> = {};
    const metaRegex = /<meta[^>]+(?:name|property)=["']([^"']+)["'][^>]+content=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;

    while ((match = metaRegex.exec(html)) !== null) {
      const name = match[1].toLowerCase();
      const content = this.decodeEntities(match[2].trim());
      metadata[name] = content;
    }

    // Alternative meta tag attribute order
    const altMetaRegex = /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']([^"']+)["']/gi;
    while ((match = altMetaRegex.exec(html)) !== null) {
      const content = this.decodeEntities(match[1].trim());
      const name = match[2].toLowerCase();
      if (!metadata[name]) {
        metadata[name] = content;
      }
    }

    return metadata;
  }

  private cleanHtml(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  }

  private convertHtmlToMarkdown(html: string): string {
    let md = html;

    // Headings
    md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, (_m, p1) => `\n# ${p1.trim()}\n`);
    md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, (_m, p1) => `\n## ${p1.trim()}\n`);
    md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, (_m, p1) => `\n### ${p1.trim()}\n`);
    md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, (_m, p1) => `\n#### ${p1.trim()}\n`);
    md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, (_m, p1) => `\n##### ${p1.trim()}\n`);
    md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, (_m, p1) => `\n###### ${p1.trim()}\n`);

    // Code blocks & Inline code
    md = md.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, (_m, p1) => `\n\`\`\`\n${p1.trim()}\n\`\`\`\n`);
    md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, (_m, p1) => `\`${p1.trim()}\``);

    // Links
    md = md.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, (_m, href, text) => {
      const cleanText = text.replace(/<[^>]+>/g, '').trim();
      return cleanText ? `[${cleanText}](${href})` : href;
    });

    // Bold & Italic
    md = md.replace(/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/gi, (_m, p1) => `**${p1.trim()}**`);
    md = md.replace(/<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/gi, (_m, p1) => `*${p1.trim()}*`);

    // Lists
    md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, (_m, p1) => `\n- ${p1.trim()}`);
    md = md.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');

    // Paragraphs and breaks
    md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, (_m, p1) => `\n${p1.trim()}\n`);
    md = md.replace(/<br\s*\/?>/gi, '\n');

    // Strip remaining HTML tags
    md = md.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    md = this.decodeEntities(md);

    // Normalize empty lines and spaces
    md = md
      .split('\n')
      .map((line) => line.trim())
      .filter((line, index, arr) => line !== '' || (index > 0 && arr[index - 1] !== ''))
      .join('\n')
      .trim();

    return md;
  }

  private stripMarkdown(md: string): string {
    return md
      .replace(/#+\s+/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`]/g, '')
      .replace(/^[\s-*\d.]+/gm, '')
      .replace(/\n+/g, ' ')
      .trim();
  }

  private decodeEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }
}
