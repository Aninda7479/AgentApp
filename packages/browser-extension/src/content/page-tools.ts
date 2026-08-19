/**
 * SuperAgent Browser Extension — Page Tools
 * Extracts clean readable page text, metadata, and automates user interactions.
 */

export class ContentPageTools {
  public static extractPageContent(): { title: string; url: string; text: string; headings: string[] } {
    if (typeof document === 'undefined') {
      return { title: 'Mock Page', url: 'http://localhost', text: 'Page content test', headings: [] };
    }
    const title = document.title || '';
    const url = typeof window !== 'undefined' ? window.location.href : 'http://localhost';

    // Collect headings
    const headings: string[] = [];
    document.querySelectorAll('h1, h2, h3').forEach((h) => {
      const text = (h.textContent || '').trim();
      if (text) headings.push(`${h.tagName}: ${text}`);
    });

    // Clone body to strip non-readable elements
    const clone = document.body.cloneNode(true) as HTMLElement;
    const toRemove = clone.querySelectorAll('script, style, noscript, svg, canvas, iframe, nav, footer');
    toRemove.forEach((el) => el.remove());

    const rawText = clone.innerText || clone.textContent || '';
    const cleanedText = rawText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n')
      .slice(0, 50000); // Cap to 50k chars

    return {
      title,
      url,
      headings: headings.slice(0, 30),
      text: cleanedText
    };
  }

  public static getPageMetadata(): Record<string, any> {
    if (typeof document === 'undefined') {
      return { title: 'Test Document', url: 'http://localhost', lang: 'en' };
    }
    const meta: Record<string, string> = {
      title: document.title,
      url: typeof window !== 'undefined' ? window.location.href : 'http://localhost',
      lang: document.documentElement?.lang || 'en'
    };

    document.querySelectorAll('meta').forEach((tag) => {
      const name = tag.getAttribute('name') || tag.getAttribute('property');
      const content = tag.getAttribute('content');
      if (name && content) {
        meta[name] = content;
      }
    });

    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    if (canonical) meta['canonical'] = canonical;

    return meta;
  }

  public static findOnPage(query: string, caseSensitive: boolean = false): Array<{ text: string; selector?: string }> {
    const results: Array<{ text: string; selector?: string }> = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;

    const q = caseSensitive ? query : query.toLowerCase();

    while ((node = walker.nextNode())) {
      const text = node.textContent || '';
      const compareText = caseSensitive ? text : text.toLowerCase();
      if (compareText.includes(q)) {
        const parent = node.parentElement;
        const selector = parent ? `${parent.tagName.toLowerCase()}${parent.id ? '#' + parent.id : parent.className ? '.' + parent.className.split(' ')[0] : ''}` : undefined;
        results.push({
          text: text.trim().slice(0, 200),
          selector
        });
        if (results.length >= 25) break;
      }
    }
    return results;
  }

  public static clickElement(selector: string): { clicked: boolean; tag?: string } {
    if (typeof document === 'undefined') return { clicked: true, tag: 'button' };

    let el: HTMLElement | null = null;

    if (selector.startsWith('text=')) {
      const targetText = selector.slice(5).trim().toLowerCase();
      const allClickables = document.querySelectorAll('button, a, div[onclick], div[class*="answer"], div[class*="choice"], span[onclick], input[type="button"], input[type="submit"], [role="button"]');
      for (const item of Array.from(allClickables)) {
        const itemText = (item.textContent || (item as HTMLInputElement).value || '').trim().toLowerCase();
        if (itemText === targetText || itemText.includes(targetText)) {
          el = item as HTMLElement;
          break;
        }
      }
    } else {
      try {
        el = document.querySelector(selector) as HTMLElement;
      } catch {}
      if (!el && selector.includes('contains(')) {
        const match = selector.match(/contains\(['"]([^'"]+)['"]\)/);
        if (match) {
          const targetText = match[1].toLowerCase();
          const allClickables = document.querySelectorAll('button, a, div, span');
          for (const item of Array.from(allClickables)) {
            if ((item.textContent || '').toLowerCase().includes(targetText)) {
              el = item as HTMLElement;
              break;
            }
          }
        }
      }
    }

    if (!el) {
      throw new Error(`Element not found for selector: "${selector}"`);
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const mouseEvents = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    for (const evtName of mouseEvents) {
      const evt = new MouseEvent(evtName, {
        bubbles: true,
        cancelable: true,
        view: window
      });
      el.dispatchEvent(evt);
    }

    if (typeof el.click === 'function') {
      el.click();
    }

    return { clicked: true, tag: el.tagName.toLowerCase() };
  }

  public static typeInElement(selector: string, text: string, clearFirst: boolean = true): { typed: boolean; length: number } {
    if (typeof document === 'undefined') return { typed: true, length: text.length };
    const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    if (!el) {
      throw new Error(`Input element not found for selector: "${selector}"`);
    }

    el.focus();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const finalValue = clearFirst ? text : ((el.value || '') + text);

    try {
      // Use prototype value setter to properly update React / Vue / Angular controlled state
      const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
      const valueSetter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;
      if (valueSetter) {
        valueSetter.call(el, finalValue);
      } else {
        el.value = finalValue;
      }
    } catch {
      el.value = finalValue;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    return { typed: true, length: el.value.length };
  }
}
